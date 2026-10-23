package scheduling

import (
	"context"
	"sync"
)

// Fake is a Scheduler for tests: it remembers every task it was asked to book.
// After Fail(err) it returns err, but still remembers the task: a real call can fail
// after Cloud Tasks saved the task (a timeout, for example).
type Fake struct {
	mu    sync.Mutex
	tasks []Task
	err   error
}

func (f *Fake) Enqueue(_ context.Context, t Task) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tasks = append(f.tasks, t)
	return f.err
}

// Tasks returns a copy of the tasks asked for, oldest first.
func (f *Fake) Tasks() []Task {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]Task(nil), f.tasks...)
}

// Fail makes the next calls fail (nil: succeed again).
func (f *Fake) Fail(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.err = err
}
