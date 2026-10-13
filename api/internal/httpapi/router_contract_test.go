package httpapi

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// The web app's API code is generated from swagger.json (orval), so the contract
// must match what the server really does, in both directions.

type swaggerSpec struct {
	Paths      map[string]map[string]json.RawMessage `json:"paths"`
	Components struct {
		Schemas map[string]struct {
			Required   []string                   `json:"required"`
			Properties map[string]json.RawMessage `json:"properties"`
		} `json:"schemas"`
	} `json:"components"`
}

func loadSwagger(t *testing.T) swaggerSpec {
	t.Helper()
	raw, err := os.ReadFile("../../swagger.json")
	if err != nil {
		t.Fatal(err)
	}
	var spec swaggerSpec
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatalf("swagger.json is not valid JSON: %v", err)
	}
	return spec
}

func TestEveryRouteIsInSwagger(t *testing.T) {
	spec := loadSwagger(t)
	api := New(nil, Deps{DB: fakeDB{}})
	for _, r := range api.routes() {
		if _, ok := spec.Paths[r.path][strings.ToLower(r.method)]; !ok {
			t.Errorf("%s %s is served but missing from swagger.json", r.method, r.path)
		}
	}
}

// notBuiltYet lists the swagger.json routes the server doesn't serve yet, with the
// milestone that builds them. Building one? Remove it here: the test below fails
// until you do, so the list stays true.
var notBuiltYet = map[string]string{
	"DELETE /me":                "M6 (delete account)",
	"GET /reminders":            "M2",
	"POST /reminders":           "M2",
	"GET /reminders/{id}":       "M2",
	"PATCH /reminders/{id}":     "M2",
	"DELETE /reminders/{id}":    "M2",
	"POST /reminders/{id}/done": "M2",
	"GET /devices":              "M3",
	"POST /devices":             "M3",
	"DELETE /devices/{id}":      "M3",
	"POST /actions/{token}":     "M5",
}

func TestEverySwaggerRouteIsServed(t *testing.T) {
	served := map[string]bool{}
	for _, r := range New(nil, Deps{DB: fakeDB{}}).routes() {
		served[r.method+" "+r.path] = true
	}
	for path, ops := range loadSwagger(t).Paths {
		for method := range ops {
			if !slices.Contains([]string{"get", "post", "put", "patch", "delete"}, method) {
				continue // e.g. "parameters" shared by the path's operations
			}
			route := strings.ToUpper(method) + " " + path
			_, planned := notBuiltYet[route]
			switch {
			case !served[route] && !planned:
				t.Errorf("%s is in swagger.json but not served (build it, or add it to notBuiltYet)", route)
			case served[route] && planned:
				t.Errorf("%s is served now: remove it from notBuiltYet", route)
			}
		}
	}
	for route := range notBuiltYet {
		method, path, _ := strings.Cut(route, " ")
		if _, ok := loadSwagger(t).Paths[path][strings.ToLower(method)]; !ok {
			t.Errorf("notBuiltYet has %s, which isn't in swagger.json", route)
		}
	}
}

func TestUserJSONMatchesSwagger(t *testing.T) {
	user := loadSwagger(t).Components.Schemas["User"]

	var fields []string
	typ := reflect.TypeFor[userJSON]()
	for i := range typ.NumField() {
		fields = append(fields, typ.Field(i).Tag.Get("json"))
	}
	for _, name := range user.Required {
		if !slices.Contains(fields, name) {
			t.Errorf("swagger User requires %q, the API doesn't send it", name)
		}
	}
	for _, name := range fields {
		if _, ok := user.Properties[name]; !ok {
			t.Errorf("the API sends %q, swagger User doesn't have it", name)
		}
	}
}
