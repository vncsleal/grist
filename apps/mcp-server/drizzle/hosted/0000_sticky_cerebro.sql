CREATE TABLE IF NOT EXISTS `hosted_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`date_start` text,
	`date_end` text,
	`status` text DEFAULT 'active' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_plan_user_ws_idx` ON `hosted_plan` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_plan_user_ws_status_idx` ON `hosted_plan` (`user_id`,`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`scope` text NOT NULL,
	`state` text NOT NULL,
	`degradation` text DEFAULT '{}' NOT NULL,
	`context_snapshot` text,
	`started_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_activity_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`closed_at` integer,
	`summary` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_session_user_ws_idx` ON `hosted_session` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_session_user_ws_state_idx` ON `hosted_session` (`user_id`,`workspace_id`,`state`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_session_user_ws_activity_idx` ON `hosted_session` (`user_id`,`workspace_id`,`last_activity_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_task` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`actor` text,
	`platform` text,
	`card_id` integer,
	`draft_id` text,
	`description` text,
	`due_date` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_task_user_ws_idx` ON `hosted_task` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_task_user_ws_status_idx` ON `hosted_task` (`user_id`,`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_task_plan_id_idx` ON `hosted_task` (`plan_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_task_user_ws_due_date_idx` ON `hosted_task` (`user_id`,`workspace_id`,`due_date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_user_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current_workspace_id` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`face_reference_image_url` text,
	`voice_reference_audio_url` text,
	`clone_consent_granted` integer DEFAULT false NOT NULL,
	`clone_consent_at` integer,
	`elevenlabs_cloned_voice_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_workspace_user_id_idx` ON `hosted_workspace` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_access` (
	`owner_user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`grantee_user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`owner_user_id`, `workspace_id`, `grantee_user_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_access_grantee_idx` ON `hosted_workspace_access` (`grantee_user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_access_workspace_idx` ON `hosted_workspace_access` (`owner_user_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_context` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`platform` text NOT NULL,
	`card_id` integer,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_draft_user_ws_idx` ON `hosted_workspace_draft` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_harvest` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`data` text NOT NULL,
	`generated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`modality` text NOT NULL,
	`prompt` text NOT NULL,
	`provider` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`output_ref` text,
	`error` text,
	`card_id` integer,
	`meta` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_job_user_workspace_idx` ON `hosted_workspace_job` (`user_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_job_user_ws_modality_idx` ON `hosted_workspace_job` (`user_id`,`workspace_id`,`modality`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `hosted_job_status_idx` ON `hosted_workspace_job` (`status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_memory` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_seen_urls` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`urls` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hosted_workspace_sources` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`urls` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`)
);
