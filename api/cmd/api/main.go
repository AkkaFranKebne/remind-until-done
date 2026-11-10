// Command api is the RUD backend that runs on Cloud Run.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // time zone names (Europe/Stockholm) built into the binary, so they work in any run image

	"github.com/AkkaFranKebne/remind-until-done/api/internal/actiontoken"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/config"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/devices"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/dispatch"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/httpapi"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/push"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/ratelimit"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/reminders"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/scheduling"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/users"
)

func main() {
	log := logging.New(os.Stdout)

	cfg, err := config.Load()
	if err != nil {
		log.Error("invalid config", "err", err)
		os.Exit(1)
	}

	pool, err := db.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	tokens, err := auth.NewFirebase(context.Background(), cfg.GCPProject)
	if err != nil {
		log.Error("firebase", "err", err)
		os.Exit(1)
	}
	// Locally there's no Google login for reading and deleting Firebase users.
	var accounts httpapi.AccountStore = auth.KeepAccounts{}
	if cfg.Env == "local" {
		log.Warn("ENV=local: deleting an account leaves the Firebase user in place")
	} else {
		accounts, err = auth.NewAccounts(context.Background(), cfg.GCPProject)
		if err != nil {
			log.Error("firebase accounts", "err", err)
			os.Exit(1)
		}
	}
	invited := auth.NewAllowlist(cfg.AllowedEmails)
	if invited.Len() == 0 {
		log.Warn("ALLOWED_EMAILS is empty: nobody can sign in")
	}

	// Who may call /internal/* (Cloud Tasks, Cloud Scheduler). Locally nothing signs
	// tokens, so INTERNAL_AUTH=off skips the check; config refuses that in dev and prod.
	// No verifier refuses every call, so a mistake here closes the door, not opens it.
	var invoker httpapi.InvokerVerifier
	if cfg.InternalAuthOff {
		invoker = auth.AnyInvoker{}
		log.Warn("INTERNAL_AUTH=off: /internal/* is open (local only)")
	} else {
		checked, err := auth.NewInvoker(context.Background(), cfg.ServiceURL, cfg.InvokerEmail)
		if err != nil {
			log.Error("invoker check", "err", err)
			os.Exit(1)
		}
		invoker = checked
	}

	// Pushes are booked as Cloud Tasks. Locally SCHEDULER=log only logs them; config refuses that in dev and prod.
	var sched scheduling.Scheduler
	if cfg.SchedulerLog {
		sched = scheduling.Log{Logger: log}
		log.Warn("SCHEDULER=log: pushes are logged, not booked (local only)")
	} else {
		tasks, err := scheduling.NewCloudTasks(context.Background(), cfg.GCPProject, cfg.TasksLocation, cfg.TasksQueue, cfg.ServiceURL, cfg.InvokerEmail)
		if err != nil {
			log.Error("cloud tasks", "err", err)
			os.Exit(1)
		}
		defer func() { _ = tasks.Close() }()
		sched = tasks
	}

	// Pushes go through FCM. Locally PUSH=log only logs them; config refuses that in dev and prod.
	var sender push.Sender
	if cfg.PushLog {
		sender = push.Log{Logger: log}
		log.Warn("PUSH=log: pushes are logged, not sent (local only)")
	} else {
		fcm, err := push.NewFCM(context.Background(), cfg.GCPProject)
		if err != nil {
			log.Error("fcm", "err", err)
			os.Exit(1)
		}
		sender = fcm
	}

	actions := actiontoken.NewSigner(cfg.ActionTokenKey)
	api := httpapi.New(log, httpapi.Deps{
		DB: pool, Tokens: tokens, Users: users.NewRepo(pool), Accounts: accounts, Reminders: reminders.NewService(pool, sched, log),
		Devices: devices.NewService(pool), Invited: invited, Invoker: invoker,
		Dispatcher: dispatch.New(pool, sender, sched, actions, log), Actions: actions,
		Limit: ratelimit.New(cfg.RateLimitPerMinute),
	})

	// Check the database once, before taking requests (/healthz reports this result).
	// The API starts either way: routes that don't need the database keep working.
	if api.CheckDatabase(context.Background()) {
		log.Info("database ok")
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Cloud Run sends SIGTERM before stopping an instance; Ctrl+C sends SIGINT locally.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	go func() {
		log.Info("listening", "port", cfg.Port, "env", cfg.Env, "firebase_project", cfg.GCPProject, "invited", invited.Len())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server stopped", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")

	// Let requests in flight finish. Cloud Run allows 10 seconds after SIGTERM.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown", "err", err)
	}
}
