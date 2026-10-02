# Handle a member's change request

A member writes to support to correct their email address. Staff change it on their behalf, with a ticket, and the change is audited.

Owner: support
Parameters: MEMBER_ID, NEW_EMAIL, TICKET

## Preconditions

### 1. The member exists
```sh
ops/psql.sh -c "SELECT id || ' ' || name || ' ' || email FROM members WHERE id = $MEMBER_ID" | grep .
```

## Steps

### 1. Verify the member's identity
```manual
Call the member back on the phone number their employer holds (not the one in the email) and confirm the request.
```

### 2. Change the email, keeping the old value
```sh
ops/psql.sh <<SQL
BEGIN;
INSERT INTO member_changes (member_id, field, old_value, new_value, ticket, operator)
  SELECT id, 'email', email, '$NEW_EMAIL', '$TICKET', '$RUNBOOK_OPERATOR' FROM members WHERE id = $MEMBER_ID;
UPDATE members SET email = '$NEW_EMAIL' WHERE id = $MEMBER_ID;
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
test "$(ops/psql.sh -c "SELECT email FROM members WHERE id = $MEMBER_ID")" = "$NEW_EMAIL"
test "$(ops/psql.sh -c "SELECT count(*) FROM member_changes WHERE ticket = '$TICKET'")" = 1
```

## Rollback

### 1. Restore the previous email
```sh
ops/psql.sh -c "UPDATE members m SET email = c.old_value FROM member_changes c WHERE c.ticket = '$TICKET' AND m.id = c.member_id"
```
