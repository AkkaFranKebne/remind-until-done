package httpapi

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
)

// The web app's API code is generated from swagger.json (orval, from M2), so the
// contract must match what the server really does.

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
