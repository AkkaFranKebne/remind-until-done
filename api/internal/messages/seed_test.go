package messages_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/AkkaFranKebne/remind-until-done/api/internal/dbtest"
	"github.com/AkkaFranKebne/remind-until-done/api/internal/messages"
)

func apiPath(parts ...string) string {
	_, here, _, _ := runtime.Caller(0)
	return filepath.Join(append([]string{filepath.Dir(here), "..", ".."}, parts...)...)
}

func realLines(t *testing.T) []messages.Line {
	t.Helper()
	f, err := os.Open(apiPath("db", "seed", "messages.csv"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	lines, err := messages.ParseCSV(f)
	if err != nil {
		t.Fatal(err)
	}
	return lines
}

func TestTheFileFollowsTheRules(t *testing.T) {
	if err := messages.Check(realLines(t)); err != nil {
		t.Error(err)
	}
}

func TestTheSQLMatchesTheCSV(t *testing.T) {
	got, err := os.ReadFile(apiPath("db", "migrations", "R__nag_messages.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, messages.RenderSQL(realLines(t))) {
		t.Error("R__nag_messages.sql is out of date: run make messages in api/")
	}
}

// valid has one active line per level, so a test can break one thing at a time.
func valid() []messages.Line {
	return []messages.Line{
		{ID: 1, Level: 1, Text: "Psst.", Active: true},
		{ID: 2, Level: 2, Text: "Plot twist.", Active: true},
		{ID: 3, Level: 3, Text: "Final boss.", Active: true},
		{ID: 4, Level: 4, Text: "The last nag.", Active: true},
		{ID: 5, Level: 5, Text: "High five. We knew it.", Active: true},
	}
}

func TestCheckFindsBrokenRules(t *testing.T) {
	tests := []struct {
		name   string
		change func([]messages.Line) []messages.Line
		want   string
	}{
		{"a gap in the ids", func(l []messages.Line) []messages.Line { l[1].ID = 9; return l }, "expected id 2"},
		{"a removed line", func(l []messages.Line) []messages.Line { return append(l[:1], l[2:]...) }, "expected id 2"},
		{"a wrong level", func(l []messages.Line) []messages.Line { l[0].Level = 6; return l }, "level must be"},
		{"empty text", func(l []messages.Line) []messages.Line { l[0].Text = ""; return l }, "1 to 140"},
		{"text too long", func(l []messages.Line) []messages.Line { l[0].Text = strings.Repeat("é", 141); return l }, "1 to 140"},
		{"brackets", func(l []messages.Line) []messages.Line { l[0].Text = "No rush. (Rush.)"; return l }, "no brackets"},
		{"a long dash", func(l []messages.Line) []messages.Line { l[0].Text = "Here — still"; return l }, "long dashes"},
		{"pending", func(l []messages.Line) []messages.Line { l[0].Text = "Still Pending."; return l }, `not "pending"`},
		{"a backslash", func(l []messages.Line) []messages.Line { l[0].Text = `Hi\`; return l }, "no backslashes"},
		{"a line break", func(l []messages.Line) []messages.Line { l[0].Text = "Hi\nthere"; return l }, "control characters"},
		{"a placeholder", func(l []messages.Line) []messages.Line { l[0].Text = "Hi ${name}"; return l }, "no ${"},
		{"a number", func(l []messages.Line) []messages.Line { l[0].Text = "This is nag 12."; return l }, "exact counts"},
		{"an ordinal", func(l []messages.Line) []messages.Line { l[0].Text = "The 12th nudge."; return l }, "exact counts"},
		{"a number word", func(l []messages.Line) []messages.Line { l[0].Text = "Eleven nags."; return l }, "exact counts"},
		{"second-to-last", func(l []messages.Line) []messages.Line { l[0].Text = "The second-to-last nag."; return l }, "exact counts"},
		{"the same text", func(l []messages.Line) []messages.Line { l[1].Text = "psst!"; return l }, "same text as id 1"},
		{"a level with no active lines", func(l []messages.Line) []messages.Line { l[2].Active = false; return l }, "level 3 has no active"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := messages.Check(tt.change(valid()))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("got %v, want an error with %q", err, tt.want)
			}
		})
	}
}

func TestCheckAllows(t *testing.T) {
	lines := valid()
	lines = append(lines,
		messages.Line{ID: 6, Level: 1, Text: "One tap. Step two: you.", Active: true},
		messages.Line{ID: 7, Level: 5, Text: "We asked nicely. You delivered. 10/10.", Active: true},
		// A retired line may repeat another, or keep its count: it's never sent.
		messages.Line{ID: 8, Level: 4, Text: "This is nag 12.", Active: false},
		messages.Line{ID: 9, Level: 1, Text: "Psst.", Active: false},
	)
	if err := messages.Check(lines); err != nil {
		t.Error(err)
	}
}

func TestParseCSVRefusesAWrongFile(t *testing.T) {
	for name, in := range map[string]string{
		"no header": "1,1,\"Psst.\",true\n",
		"bad id":    "id,level,text,active\nx,1,\"Psst.\",true\n",
		"bad level": "id,level,text,active\n1,x,\"Psst.\",true\n",
		"bad flag":  "id,level,text,active\n1,1,\"Psst.\",maybe\n",
		"too short": "id,level,text,active\n1,1\n",
	} {
		if _, err := messages.ParseCSV(strings.NewReader(in)); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}

func TestParseCSVReadsQuotesAndCommas(t *testing.T) {
	got, err := messages.ParseCSV(strings.NewReader("id,level,text,active\n1,2,\"It's \"\"here\"\", still.\",false\n"))
	if err != nil {
		t.Fatal(err)
	}
	want := messages.Line{ID: 1, Level: 2, Text: `It's "here", still.`, Active: false}
	if len(got) != 1 || got[0] != want {
		t.Errorf("got %+v", got)
	}
}

// Start applies the real R__nag_messages.sql, the way Flyway does. Running it again must change
// nothing, and an edited line must reach the database.
func TestTheSQLLoadsAndUpdates(t *testing.T) {
	pool := dbtest.Start(t)
	ctx := context.Background()

	lines := realLines(t)
	var rows, active, inactive int
	if err := pool.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE active), count(*) FILTER (WHERE NOT active) FROM nag_messages`).Scan(&rows, &active, &inactive); err != nil {
		t.Fatal(err)
	}
	wantActive := 0
	for _, l := range lines {
		if l.Active {
			wantActive++
		}
	}
	if rows != len(lines) || active != wantActive || inactive != len(lines)-wantActive {
		t.Errorf("rows=%d active=%d inactive=%d, want %d, %d, %d", rows, active, inactive, len(lines), wantActive, len(lines)-wantActive)
	}

	// A quote survives: the SQL doubles it.
	i := slices.IndexFunc(lines, func(l messages.Line) bool { return strings.Contains(l.Text, "'") })
	if i < 0 {
		t.Fatal("no line with a quote")
	}
	var text string
	if err := pool.QueryRow(ctx, `SELECT text FROM nag_messages WHERE id = $1`, lines[i].ID).Scan(&text); err != nil {
		t.Fatal(err)
	}
	if text != lines[i].Text {
		t.Errorf("id %d: got %q, want %q", lines[i].ID, text, lines[i].Text)
	}

	// Running it again changes no row: the row version stays the same.
	version := func(id int) string {
		t.Helper()
		var v string
		if err := pool.QueryRow(ctx, `SELECT xmin::text FROM nag_messages WHERE id = $1`, id).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	before := version(2)
	if _, err := pool.Exec(ctx, string(messages.RenderSQL(lines))); err != nil {
		t.Fatal(err)
	}
	if version(2) != before {
		t.Error("an unchanged line was written again")
	}

	// An edited line reaches the database.
	edited := slices.Clone(lines)
	edited[0] = messages.Line{ID: 1, Level: 2, Text: "It's edited.", Active: false}
	if _, err := pool.Exec(ctx, string(messages.RenderSQL(edited))); err != nil {
		t.Fatal(err)
	}
	var level int
	var isActive bool
	if err := pool.QueryRow(ctx, `SELECT level, text, active FROM nag_messages WHERE id = 1`).Scan(&level, &text, &isActive); err != nil {
		t.Fatal(err)
	}
	if level != 2 || text != "It's edited." || isActive {
		t.Errorf("edit not applied: %d %q %t", level, text, isActive)
	}

	// A line deleted from the end of the file stops being sent, and its row stays:
	// user_seen_messages may point at it.
	last := lines[len(lines)-1].ID
	if _, err := pool.Exec(ctx, string(messages.RenderSQL(lines[:len(lines)-1]))); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT active FROM nag_messages WHERE id = $1`, last).Scan(&isActive); err != nil {
		t.Fatal(err)
	}
	if isActive {
		t.Errorf("id %d was deleted from the file but is still active", last)
	}
	if err := pool.QueryRow(ctx, `SELECT active FROM nag_messages WHERE id = 2`).Scan(&isActive); err != nil {
		t.Fatal(err)
	}
	if !isActive {
		t.Error("deleting the last line retired another one")
	}
}
