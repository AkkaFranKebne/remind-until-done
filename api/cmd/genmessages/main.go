// genmessages turns db/seed/messages.csv into the Flyway file db/migrations/R__nag_messages.sql.
// Run it from api/ with "make messages" after editing the CSV. It refuses a file that breaks
// the rules for lines (internal/messages). It runs on your computer, never in a deploy.
package main

import (
	"fmt"
	"os"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/messages"
)

const (
	csvPath = "db/seed/messages.csv"
	sqlPath = "db/migrations/R__nag_messages.sql"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	f, err := os.Open(csvPath)
	if err != nil {
		return err
	}
	defer f.Close()
	lines, err := messages.ParseCSV(f)
	if err != nil {
		return fmt.Errorf("%s: %w", csvPath, err)
	}
	if err := messages.Check(lines); err != nil {
		return fmt.Errorf("%s:\n%w", csvPath, err)
	}
	if err := os.WriteFile(sqlPath, messages.RenderSQL(lines), 0o644); err != nil {
		return err
	}
	fmt.Printf("%s: %d lines\n", sqlPath, len(lines))
	return nil
}
