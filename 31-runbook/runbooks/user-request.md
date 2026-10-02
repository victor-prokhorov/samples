# Handle a member's change request

A member writes to support to correct their email address. Staff change it on their behalf, with a ticket, and the change is audited.

Owner: support
Parameters: MEMBER_ID, NEW_EMAIL, TICKET

## Preconditions

### 1. The member exists
```sh
ops/psql.sh -v id="$MEMBER_ID" <<'SQL' | grep .
SELECT id || ' ' || name || ' ' || email FROM members WHERE id = :'id'::int
SQL
```

## Steps

### 1. Verify the member's identity
```manual
Call the member back on the phone number their employer holds (not the one in the email) and confirm the request.
```

### 2. Change the email, keeping the old value
The parameters reach SQL as psql variables (`:'email'` is quoted by psql, `:'id'::int` must be a number), never pasted into the SQL text, so an address like o'brien@example.org is stored as typed.
```sh
ops/psql.sh -v id="$MEMBER_ID" -v email="$NEW_EMAIL" -v ticket="$TICKET" -v operator="$RUNBOOK_OPERATOR" <<'SQL'
BEGIN;
INSERT INTO member_changes (member_id, field, old_value, new_value, ticket, operator)
  SELECT id, 'email', email, :'email', :'ticket', :'operator' FROM members WHERE id = :'id'::int;
UPDATE members SET email = :'email' WHERE id = :'id'::int;
COMMIT;
SQL
```

### 3. Reply to the member
```manual
Reply on the ticket: the change is done, and the next statement will go to the new address.
```

## Verification

### 1. The new email is stored and audited
```sh
email=$(ops/psql.sh -v id="$MEMBER_ID" <<'SQL'
SELECT email FROM members WHERE id = :'id'::int
SQL
)
changes=$(ops/psql.sh -v ticket="$TICKET" <<'SQL'
SELECT count(*) FROM member_changes WHERE ticket = :'ticket'
SQL
)
echo "stored $email, changes on $TICKET: $changes"
test "$email" = "$NEW_EMAIL"
test "$changes" = 1
```

## Rollback

### 1. Restore the previous email
```sh
ops/psql.sh -v ticket="$TICKET" <<'SQL'
UPDATE members m SET email = c.old_value FROM member_changes c WHERE c.ticket = :'ticket' AND m.id = c.member_id
SQL
```
