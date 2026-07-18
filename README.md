# Flash Cards Backend

NestJS backend reorganized into a layered structure:

- `src/infra`: infrastructure concerns such as config, persistence, cache, logging, throttling, token handling, and background job queues.
- `src/core`: shared domain/security primitives that are not tied to HTTP or external providers.
- `src/application`: core business logic and use-case services.
- `src/api`: HTTP controller modules only. Each feature has a thin API module that imports the matching application module.
- `src/integrations`: third-party clients and adapters, including Gemini.
- `src/worker`: background worker entrypoints and queue processors.

## Folder Structure

```text
src/
  app.module.ts              # HTTP application composition root
  main.ts                    # HTTP bootstrap
  worker.main.ts             # BullMQ worker bootstrap
  api/                       # Controller-only modules
    auth-api/
    user-api/
    activities-api/
    analytics-api/
  application/               # Use cases and business rules
    auth/
    user/
    activities/
    analytics/
  core/                      # Security and shared domain policies
  infra/                     # Infrastructure modules and shared providers
    config/
    database/
    cache/
    messaging/
    audit/
    logger/
  integrations/              # External service clients
    gemini/
  worker/                    # Queue workers and processors
```

## Runtime Composition

The HTTP app is composed from `InfraModule`, `IntegrationsModule`, `ApplicationModule`, `ApiModule`, and `CoreModule`.

The worker process uses BullMQ instead of RabbitMQ for background jobs. Email and other queue jobs should be handled through the BullMQ queue layer under `src/infra/messaging` and processed from `src/worker/workers`.

## Notes

- API modules should stay controller-only.
- Application modules should hold services, repositories, and domain workflows.
- Infrastructure modules should own external dependencies and cross-cutting providers.
- Gemini-specific logic belongs under `src/integrations/gemini`.
