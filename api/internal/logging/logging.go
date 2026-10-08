// Package logging sets up structured JSON logs for Cloud Logging.
//
// Cloud Run sends stdout to Cloud Logging. Cloud Logging reads the
// "severity" and "message" fields, so the standard slog keys are renamed.
package logging

import (
	"io"
	"log/slog"
)

func New(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if len(groups) > 0 {
				return a
			}
			switch a.Key {
			case slog.MessageKey:
				a.Key = "message"
			case slog.LevelKey:
				a.Key = "severity"
				a.Value = slog.StringValue(severity(a.Value.Any().(slog.Level)))
			}
			return a
		},
	}))
}

// severity maps slog levels to Cloud Logging severities.
func severity(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return "ERROR"
	case l >= slog.LevelWarn:
		return "WARNING"
	case l >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}
