# Operations

The normal launcher is non-destructive: it starts only this project's two processes and stops only those child processes. It never installs dependencies, creates a database, applies migrations, seeds data, starts PostgreSQL, or kills a process by port.

1. Copy .env.example to .env and replace every placeholder. Use a random JWT secret of at least 32 characters. TLS verification remains enabled when DB_SSL=true.
2. Run ./scripts/bootstrap.sh once to install locked dependencies.
3. Run ./scripts/migrate.sh explicitly to apply additive schema changes.
4. Run ./start.sh.

./scripts/seed-demo.sh is optional and guarded because legacy demo seeds may replace data. Never use it against shared or production databases.

Provider variables only declare adapter configuration. A configured URL does not prove certification, availability, licensing, or a successful connection. The workflow /providers endpoint reports only configured/unconfigured state, never secrets. Provider attempts must record a succeeded, failed, or retrying sync event.

Privileged workflow roles are not granted by public registration. Provision brand reviewers, publishers, release authorities, qualified care professionals, controllers, dispatchers, and fleet/maintenance managers through an audited administrative process. Model output is advisory and cannot satisfy authoritative-evidence or human-attestation requirements.

