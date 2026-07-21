import { Migration } from "@mikro-orm/migrations";

export class Migration20260923071649 extends Migration {
  override name = "Migration20260923071649";

  override up(): void | Promise<void> {
    this.addSql(
      `create type "role" as enum ('USER', 'RESEARCHER', 'ADMIN', 'MODERATOR', 'SUPER_ADMIN');`,
    );
    this.addSql(
      `create type "account_status" as enum ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');`,
    );
    this.addSql(
      `create type "token_type" as enum ('ACCESS', 'REFRESH', 'PASSWORD_RESET', 'EMAIL_VERIFICATION');`,
    );
    this.addSql(
      `create type "audit_action" as enum ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'ROLE_CHANGE', 'TOKEN_REVOKE');`,
    );
    this.addSql(
      `create table "app_setting" ("id" uuid not null default gen_random_uuid(), "key" varchar(255) not null, "value" varchar(255) not null, "description" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "app_setting" add constraint "app_setting_key_unique" unique ("key");`,
    );
    this.addSql(
      `create index "app_setting_key_index" on "app_setting" ("key");`,
    );

    this.addSql(
      `create table "user" ("user_id" uuid not null default gen_random_uuid(), "email" varchar(255) not null, "username" varchar(255) not null, "password" varchar(255) not null, "role" "role" not null default 'USER', "status" "account_status" not null default 'PENDING_VERIFICATION', "is_active" boolean not null default true, "email_verified" boolean not null default false, "email_verified_at" timestamptz null, "phone_verified" boolean not null default false, "phone_verified_at" timestamptz null, "two_factor_enforced" boolean not null default false, "two_factor_enabled" boolean not null default false, "two_factor_secret" varchar(255) null, "password_changed_at" timestamptz null, "last_login_at" timestamptz null, "last_login_ip" varchar(255) null, "force_password_change" boolean not null default false, "failed_login_attempts" int not null default 0, "locked_until" timestamptz null, "deleted_at" timestamptz null, "email_recycled_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("user_id"));`,
    );
    this.addSql(
      `alter table "user" add constraint "user_email_unique" unique ("email");`,
    );
    this.addSql(
      `alter table "user" add constraint "user_username_unique" unique ("username");`,
    );
    this.addSql(`create index "user_email_index" on "user" ("email");`);
    this.addSql(`create index "user_status_index" on "user" ("status");`);
    this.addSql(
      `create index "user_deleted_at_index" on "user" ("deleted_at");`,
    );
    this.addSql(
      `create index "user_email_recycled_at_index" on "user" ("email_recycled_at");`,
    );
    this.addSql(
      `create index "user_deleted_at_email_recycled_at_index" on "user" ("deleted_at", "email_recycled_at");`,
    );

    this.addSql(
      `create table "token" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "token" varchar(500) not null, "token_hash" varchar(255) not null, "type" "token_type" not null, "expires_at" timestamptz not null, "revoked_at" timestamptz null, "revoked_reason" varchar(255) null, "device_info" text null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "token" add constraint "token_token_unique" unique ("token");`,
    );
    this.addSql(
      `alter table "token" add constraint "token_token_hash_unique" unique ("token_hash");`,
    );
    this.addSql(`create index "token_user_id_index" on "token" ("user_id");`);
    this.addSql(
      `create index "token_token_hash_index" on "token" ("token_hash");`,
    );
    this.addSql(`create index "token_type_index" on "token" ("type");`);
    this.addSql(
      `create index "token_expires_at_index" on "token" ("expires_at");`,
    );
    this.addSql(
      `create index "token_revoked_at_index" on "token" ("revoked_at");`,
    );
    this.addSql(
      `create index "token_deleted_at_index" on "token" ("deleted_at");`,
    );

    this.addSql(
      `create table "request_log" ("id" uuid not null default gen_random_uuid(), "request_id" varchar(255) not null, "user_id" uuid null, "method" varchar(255) not null, "path" varchar(255) not null, "query" jsonb null, "body" jsonb null, "headers" jsonb null, "status_code" int null, "response_time" int null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "error_message" text null, "error_stack" text null, "deleted_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "request_log" add constraint "request_log_request_id_unique" unique ("request_id");`,
    );
    this.addSql(
      `create index "request_log_request_id_index" on "request_log" ("request_id");`,
    );
    this.addSql(
      `create index "request_log_user_id_index" on "request_log" ("user_id");`,
    );
    this.addSql(
      `create index "request_log_method_index" on "request_log" ("method");`,
    );
    this.addSql(
      `create index "request_log_path_index" on "request_log" ("path");`,
    );
    this.addSql(
      `create index "request_log_status_code_index" on "request_log" ("status_code");`,
    );
    this.addSql(
      `create index "request_log_created_at_index" on "request_log" ("created_at");`,
    );
    this.addSql(
      `create index "request_log_deleted_at_index" on "request_log" ("deleted_at");`,
    );

    this.addSql(
      `create table "login_history" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "login_at" timestamptz not null, "logout_at" timestamptz null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "device_type" varchar(255) null, "browser" varchar(255) null, "os" varchar(255) null, "location" varchar(255) null, "latitude" real null, "longitude" real null, "is_successful" boolean not null default true, "failure_reason" varchar(255) null, "session_duration" int null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "login_history_user_id_login_at_index" on "login_history" ("user_id", "login_at");`,
    );
    this.addSql(
      `create index "login_history_deleted_at_index" on "login_history" ("deleted_at");`,
    );

    this.addSql(
      `create table "audit_log" ("id" uuid not null default gen_random_uuid(), "user_id" uuid null, "performed_by_id" uuid null, "action" "audit_action" not null, "entity_type" varchar(255) not null, "entity_id" varchar(255) null, "old_values" jsonb null, "new_values" jsonb null, "changes" jsonb null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "request_id" varchar(255) null, "metadata" jsonb null, "deleted_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "audit_log_user_id_index" on "audit_log" ("user_id");`,
    );
    this.addSql(
      `create index "audit_log_performed_by_id_index" on "audit_log" ("performed_by_id");`,
    );
    this.addSql(
      `create index "audit_log_action_index" on "audit_log" ("action");`,
    );
    this.addSql(
      `create index "audit_log_entity_type_index" on "audit_log" ("entity_type");`,
    );
    this.addSql(
      `create index "audit_log_entity_id_index" on "audit_log" ("entity_id");`,
    );
    this.addSql(
      `create index "audit_log_created_at_index" on "audit_log" ("created_at");`,
    );
    this.addSql(
      `create index "audit_log_deleted_at_index" on "audit_log" ("deleted_at");`,
    );

    this.addSql(
      `create table "activity" ("id" uuid not null default gen_random_uuid(), "type" varchar(255) not null, "entity_type" varchar(255) not null, "entity_id" varchar(255) not null, "parent_entity_type" varchar(255) null, "parent_entity_id" varchar(255) null, "actor_id" uuid null, "context_type" varchar(255) null, "context_id" varchar(255) null, "created_at" timestamptz not null, "data" jsonb not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "activity_entity_type_entity_id_created_at_index" on "activity" ("entity_type", "entity_id", "created_at");`,
    );
    this.addSql(
      `create index "activity_context_type_context_id_created_at_index" on "activity" ("context_type", "context_id", "created_at");`,
    );

    this.addSql(
      `create table "user_profile" ("id" uuid not null default gen_random_uuid(), "user_id" uuid not null, "first_name" varchar(255) not null, "last_name" varchar(255) null, "display_name" varchar(255) null, "avatar" varchar(255) null, "bio" text null, "phone_number" varchar(255) null, "date_of_birth" timestamptz null, "gender" varchar(255) null, "country" varchar(255) null, "state" varchar(255) null, "city" varchar(255) null, "address" text null, "postal_code" varchar(255) null, "timezone" varchar(255) null default 'UTC', "language" varchar(255) null default 'en', "currency" varchar(255) null default 'USD', "website" varchar(255) null, "social_links" jsonb null, "preferences" jsonb null, "metadata" jsonb null, "deleted_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "user_profile" add constraint "user_profile_user_id_unique" unique ("user_id");`,
    );
    this.addSql(
      `alter table "user_profile" add constraint "user_profile_phone_number_unique" unique ("phone_number");`,
    );
    this.addSql(
      `create index "user_profile_user_id_index" on "user_profile" ("user_id");`,
    );
    this.addSql(
      `create index "user_profile_phone_number_index" on "user_profile" ("phone_number");`,
    );
    this.addSql(
      `create index "user_profile_deleted_at_index" on "user_profile" ("deleted_at");`,
    );

    this.addSql(
      `alter table "token" add constraint "token_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );

    this.addSql(
      `alter table "request_log" add constraint "request_log_user_id_foreign" foreign key ("user_id") references "user" ("user_id") on delete set null;`,
    );

    this.addSql(
      `alter table "login_history" add constraint "login_history_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );

    this.addSql(
      `alter table "audit_log" add constraint "audit_log_user_id_foreign" foreign key ("user_id") references "user" ("user_id") on delete set null;`,
    );
    this.addSql(
      `alter table "audit_log" add constraint "audit_log_performed_by_id_foreign" foreign key ("performed_by_id") references "user" ("user_id") on delete set null;`,
    );

    this.addSql(
      `alter table "activity" add constraint "activity_actor_id_foreign" foreign key ("actor_id") references "user" ("user_id") on delete set null;`,
    );

    this.addSql(
      `alter table "user_profile" add constraint "user_profile_user_id_foreign" foreign key ("user_id") references "user" ("user_id");`,
    );
  }
}
