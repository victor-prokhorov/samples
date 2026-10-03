# Permission matrix

Generated from `src/policy.ts` by `npm run matrix`; do not edit by hand. A cell is what `can(user, action, resource)` answers when the resource is the user's own record, a record of the user's organisation, or a record of another organisation. `–` means that relationship cannot exist for the role (staff and auditors have no member record and no organisation; an employer admin has no member record). `test/matrix.test.ts` checks every cell against the expectations; `test/rls.test.ts` checks that Postgres row-level security gives the same answer.

| role | action | rule | own record | same organisation | other organisation |
| --- | --- | --- | --- | --- | --- |
| member | `member:read` | own record | allow | deny | deny |
| member | `member:update` | own record | allow | deny | deny |
| member | `contribution:read` | own record | allow | deny | deny |
| member | `contribution:create` | no rule: deny by default | deny | deny | deny |
| member | `change_request:create` | own record and requested by me | allow | deny | deny |
| member | `change_request:read` | own record | allow | deny | deny |
| member | `change_request:approve (requested by someone else)` | no rule: deny by default | deny | deny | deny |
| member | `change_request:approve (requested by me)` | no rule: deny by default | deny | deny | deny |
| member | `audit_log:read` | no rule: deny by default | deny | deny | deny |
| employer_admin | `member:read` | same organisation | – | allow | deny |
| employer_admin | `member:update` | no rule: deny by default | – | deny | deny |
| employer_admin | `contribution:read` | same organisation | – | allow | deny |
| employer_admin | `contribution:create` | same organisation | – | allow | deny |
| employer_admin | `change_request:create` | same organisation and requested by me | – | allow | deny |
| employer_admin | `change_request:read` | same organisation | – | allow | deny |
| employer_admin | `change_request:approve (requested by someone else)` | no rule: deny by default | – | deny | deny |
| employer_admin | `change_request:approve (requested by me)` | no rule: deny by default | – | deny | deny |
| employer_admin | `audit_log:read` | no rule: deny by default | – | deny | deny |
| staff | `member:read` | any organisation | – | – | allow |
| staff | `member:update` | no rule: deny by default | – | – | deny |
| staff | `contribution:read` | any organisation | – | – | allow |
| staff | `contribution:create` | no rule: deny by default | – | – | deny |
| staff | `change_request:create` | any organisation and requested by me | – | – | allow |
| staff | `change_request:read` | any organisation | – | – | allow |
| staff | `change_request:approve (requested by someone else)` | any organisation and pending and not requested by me | – | – | allow |
| staff | `change_request:approve (requested by me)` | any organisation and pending and not requested by me | – | – | deny |
| staff | `audit_log:read` | no rule: deny by default | – | – | deny |
| auditor | `member:read` | any organisation | – | – | allow |
| auditor | `member:update` | no rule: deny by default | – | – | deny |
| auditor | `contribution:read` | any organisation | – | – | allow |
| auditor | `contribution:create` | no rule: deny by default | – | – | deny |
| auditor | `change_request:create` | no rule: deny by default | – | – | deny |
| auditor | `change_request:read` | any organisation | – | – | allow |
| auditor | `change_request:approve (requested by someone else)` | no rule: deny by default | – | – | deny |
| auditor | `change_request:approve (requested by me)` | no rule: deny by default | – | – | deny |
| auditor | `audit_log:read` | any organisation | – | – | allow |
