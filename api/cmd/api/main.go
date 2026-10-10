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

	"github.com/AkkaFranKebne/remind-until-done/api/internal/config"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/db"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/httpapi"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/logging"
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

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           httpapi.New(log, pool).Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Cloud Run sends SIGTERM before stopping an instance; Ctrl+C sends SIGINT locally.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	go func() {
		log.Info("listening", "port", cfg.Port, "env", cfg.Env)
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
