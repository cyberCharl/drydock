CREATE OR REPLACE FUNCTION "public"."log_item_changelog"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_user_name text := current_setting('app.current_user', true);
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO "changelog" ("item_id", "field_name", "old_value", "new_value", "changed_by")
    VALUES (OLD.id, 'title', OLD.title, NEW.title, current_user_name);
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO "changelog" ("item_id", "field_name", "old_value", "new_value", "changed_by")
    VALUES (OLD.id, 'status', OLD.status::text, NEW.status::text, current_user_name);
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO "changelog" ("item_id", "field_name", "old_value", "new_value", "changed_by")
    VALUES (OLD.id, 'priority', OLD.priority::text, NEW.priority::text, current_user_name);
  END IF;

  IF OLD.description IS DISTINCT FROM NEW.description THEN
    INSERT INTO "changelog" ("item_id", "field_name", "old_value", "new_value", "changed_by")
    VALUES (OLD.id, 'description', OLD.description, NEW.description, current_user_name);
  END IF;

  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    INSERT INTO "changelog" ("item_id", "field_name", "old_value", "new_value", "changed_by")
    VALUES (OLD.id, 'parent_id', OLD.parent_id::text, NEW.parent_id::text, current_user_name);
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "items_changelog_before_update" ON "items";
--> statement-breakpoint
CREATE TRIGGER "items_changelog_before_update"
BEFORE UPDATE ON "items"
FOR EACH ROW
EXECUTE FUNCTION "public"."log_item_changelog"();
