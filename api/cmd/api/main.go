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

	"github.com/AkkaFranKebne/remind-until-done/api/internal/auth"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/config"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/httpapi"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
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
	invited := auth.NewAllowlist(cfg.AllowedEmails)
	if invited.Len() == 0 {
		log.Warn("ALLOWED_EMAILS is empty: nobody can sign in")
	}

	api := httpapi.New(log, httpapi.Deps{DB: pool, Tokens: tokens, Users: users.NewRepo(pool), Invited: invited})

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
