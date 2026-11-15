package scheduling

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	cloudtasks "cloud.google.com/go/cloudtasks/apiv2"
	"cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	// The task is booked inside the database transaction that saves the reminder. A task
	// that fired before the commit would find nothing to send, so none runs sooner than this.
	minLead = 5 * time.Second
	// A request waits at most this long for Cloud Tasks, then answers 503.
	enqueueTimeout = 5 * time.Second
)

// CloudTasks books tasks in the reminders queue. Each task calls
// {serviceURL}/internal/tasks/fire with a Google ID token for invokerEmail, made for
// serviceURL: exactly what the /internal check (auth.Invoker) accepts.
type CloudTasks struct {
	client       *cloudtasks.Client
	queuePath    string // projects/P/locations/L/queues/Q
	serviceURL   string
	invokerEmail string
	now          func() time.Time
}

// NewCloudTasks logs in as the Cloud Run service account (on a laptop: gcloud's application default login).
func NewCloudTasks(ctx context.Context, project, location, queue, serviceURL, invokerEmail string) (*CloudTasks, error) {
	if project == "" || location == "" || queue == "" || serviceURL == "" || invokerEmail == "" {
		return nil, errors.New("cloud tasks: project, location, queue, service URL and invoker are all required")
	}
	client, err := cloudtasks.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("cloud tasks client: %w", err)
	}
	return &CloudTasks{
		client:       client,
		queuePath:    fmt.Sprintf("projects/%s/locations/%s/queues/%s", project, location, queue),
		serviceURL:   serviceURL,
		invokerEmail: invokerEmail,
		now:          time.Now,
	}, nil
}

func (c *CloudTasks) Close() error { return c.client.Close() }

func (c *CloudTasks) Enqueue(ctx context.Context, t Task) error {
	ctx, cancel := context.WithTimeout(ctx, enqueueTimeout)
	defer cancel()
	req := c.request(t)
	return createWithRetry(ctx, func(ctx context.Context) error {
		_, err := c.client.CreateTask(ctx, req)
		return err
	}, retryWaits)
}

// retryWaits are the pauses before a second and a third try. All tries share enqueueTimeout,
// so a request still waits at most that long.
var retryWaits = []time.Duration{200 * time.Millisecond, 600 * time.Millisecond}

// createWithRetry tries again only when Cloud Tasks was Unavailable: a dropped connection, the
// error that left a reminder silent until the sweep on 2026-11-15. The client library doesn't
// retry CreateTask by itself. Trying again is safe: the task name is fixed (Task.Name), so if
// an earlier try did get through, the next one answers AlreadyExists, which counts as booked.
func createWithRetry(ctx context.Context, create func(context.Context) error, waits []time.Duration) error {
	for i := 0; ; i++ {
		err := create(ctx)
		if err == nil || status.Code(err) == codes.AlreadyExists {
			return nil
		}
		if status.Code(err) != codes.Unavailable || i == len(waits) {
			return err
		}
		timer := time.NewTimer(waits[i])
		select {
		case <-ctx.Done():
			timer.Stop()
			return err
		case <-timer.C:
		}
	}
}

func (c *CloudTasks) request(t Task) *cloudtaskspb.CreateTaskRequest {
	at := t.At
	if earliest := c.now().Add(minLead); at.Before(earliest) {
		at = earliest
	}
	body, _ := json.Marshal(Body{ReminderID: t.ReminderID, Version: t.Version, N: t.N}) // ints and a string: can't fail
	return &cloudtaskspb.CreateTaskRequest{
		Parent: c.queuePath,
		Task: &cloudtaskspb.Task{
			Name:         c.queuePath + "/tasks/" + t.Name(),
			ScheduleTime: timestamppb.New(at),
			MessageType: &cloudtaskspb.Task_HttpRequest{HttpRequest: &cloudtaskspb.HttpRequest{
				HttpMethod: cloudtaskspb.HttpMethod_POST,
				Url:        c.serviceURL + "/internal/tasks/fire",
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       body,
				AuthorizationHeader: &cloudtaskspb.HttpRequest_OidcToken{OidcToken: &cloudtaskspb.OidcToken{
					ServiceAccountEmail: c.invokerEmail,
					Audience:            c.serviceURL,
				}},
			}},
		},
	}
}
