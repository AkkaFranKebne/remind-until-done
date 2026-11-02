// Package messages holds the nag lines (design doc 3.8). db/seed/messages.csv is the file people
// edit. Flyway loads it from db/migrations/R__nag_messages.sql, which "make messages" generates
// from the CSV (decision 68): that way no new program runs in the deploy after the Google login.
package messages

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxTextLen = 140 // same limit as the CHECK on nag_messages.text

// Line is one row of messages.csv.
type Line struct {
	ID     int
	Level  int
	Text   string
	Active bool
}

// ParseCSV reads messages.csv: the header id,level,text,active and then one line per row.
func ParseCSV(r io.Reader) ([]Line, error) {
	rows, err := csv.NewReader(r).ReadAll()
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 || strings.Join(rows[0], ",") != "id,level,text,active" {
		return nil, errors.New("the first row must be id,level,text,active")
	}
	lines := make([]Line, 0, len(rows)-1)
	for i, row := range rows[1:] {
		id, err := strconv.Atoi(row[0])
		if err != nil {
			return nil, fmt.Errorf("row %d: id: %w", i+2, err)
		}
		level, err := strconv.Atoi(row[1])
		if err != nil {
			return nil, fmt.Errorf("row %d: level: %w", i+2, err)
		}
		active, err := strconv.ParseBool(row[3])
		if err != nil {
			return nil, fmt.Errorf("row %d: active: %w", i+2, err)
		}
		lines = append(lines, Line{ID: id, Level: level, Text: row[2], Active: active})
	}
	return lines, nil
}

var (
	// An exact count is true on one push only, and an edit restarts the count (decision 67).
	// "One" and "two" stay allowed: "one tap", "step two".
	exactCount = regexp.MustCompile(`(?i)\b(three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|\d+(st|nd|rd|th)?|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b|second-to-last|penultimate`)
	// Not counts of anything we send.
	notACount = regexp.MustCompile(`(?i)high[- ]five|10/10`)
	// The app says "Waiting" (decision 67).
	pendingWord = regexp.MustCompile(`(?i)\bpending\b`)
	notAWord    = regexp.MustCompile(`[^\pL\pN]+`)
)

// Check returns every line that breaks a rule of design doc 3.8 and decision 67, joined.
func Check(lines []Line) error {
	var problems []error
	report := func(id int, format string, args ...any) {
		problems = append(problems, fmt.Errorf("id %d: "+format, append([]any{id}, args...)...))
	}
	activeAt := map[int]int{}
	seen := map[string]int{}
	for i, l := range lines {
		// Ids are permanent: a line that's gone from the file would stay in the database, still
		// active. So nothing may be removed, and the numbers run 1, 2, 3...
		if l.ID != i+1 {
			report(l.ID, "expected id %d: ids run without gaps, and a line is retired with active=false", i+1)
		}
		if l.Level < 1 || l.Level > 5 {
			report(l.ID, "level must be 1 to 5")
		}
		if n := utf8.RuneCountInString(l.Text); n < 1 || n > maxTextLen {
			report(l.ID, "text must be 1 to %d characters, it has %d", maxTextLen, n)
		}
		if strings.ContainsAny(l.Text, "()") {
			report(l.ID, "no brackets in text")
		}
		if strings.Contains(l.Text, "—") {
			report(l.ID, "no long dashes in text")
		}
		if pendingWord.MatchString(l.Text) {
			report(l.ID, `say "waiting", not "pending"`)
		}
		// Flyway would try to fill in a ${placeholder}.
		if strings.Contains(l.Text, "${") {
			report(l.ID, "no ${ in text")
		}
		if strings.ContainsFunc(l.Text, func(r rune) bool { return r == '\\' || unicode.IsControl(r) }) {
			report(l.ID, "no backslashes or control characters in text")
		}
		if !l.Active {
			continue
		}
		activeAt[l.Level]++
		if exactCount.MatchString(notACount.ReplaceAllString(l.Text, "")) {
			report(l.ID, "no exact counts in text")
		}
		key := strings.TrimSpace(notAWord.ReplaceAllString(strings.ToLower(l.Text), " "))
		if first, ok := seen[key]; ok {
			report(l.ID, "same text as id %d", first)
		}
		seen[key] = l.ID
	}
	for level := 1; level <= 5; level++ {
		if activeAt[level] == 0 {
			problems = append(problems, fmt.Errorf("level %d has no active lines", level))
		}
	}
	return errors.Join(problems...)
}

// RenderSQL builds the repeatable Flyway migration. Flyway runs it again whenever its text
// changes. Rows that didn't change get no new version, though each is locked for a moment.
// Lines deleted from the end of the file are retired, or they'd keep being sent: Check can't
// see them, since the ids that are left still have no gap.
//
// This is the one place that builds SQL as text: it runs on a computer, from a reviewed file,
// never on user input. A ' can only end a string by being doubled, and Check refuses \ and ${.
func RenderSQL(lines []Line) []byte {
	var b bytes.Buffer
	b.WriteString("-- Generated from db/seed/messages.csv by \"make messages\". Don't edit: edit the CSV.\n")
	b.WriteString("INSERT INTO nag_messages (id, level, text, active) VALUES\n")
	for i, l := range lines {
		sep := ","
		if i == len(lines)-1 {
			sep = ""
		}
		fmt.Fprintf(&b, "(%d, %d, '%s', %t)%s\n", l.ID, l.Level, strings.ReplaceAll(l.Text, "'", "''"), l.Active, sep)
	}
	b.WriteString("ON CONFLICT (id) DO UPDATE SET level = EXCLUDED.level, text = EXCLUDED.text, active = EXCLUDED.active\n")
	b.WriteString("WHERE (nag_messages.level, nag_messages.text, nag_messages.active)\n")
	b.WriteString("  IS DISTINCT FROM (EXCLUDED.level, EXCLUDED.text, EXCLUDED.active);\n")
	if len(lines) > 0 {
		fmt.Fprintf(&b, "UPDATE nag_messages SET active = false WHERE id > %d AND active;\n", lines[len(lines)-1].ID)
	}
	return b.Bytes()
}
