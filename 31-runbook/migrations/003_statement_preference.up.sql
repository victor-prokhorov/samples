ALTER TABLE members ADD COLUMN statement_preference text NOT NULL DEFAULT 'post' CHECK (statement_preference IN ('post', 'email'));
