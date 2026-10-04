// The CRM's shapes, exactly as its API returns them. Only files in src/acl/ may import this.
export interface CrmContact {
  "@odata.etag": string;
  ContactId: string;
  FirstName: string | null;
  LastName: string | null;
  EMailAddress1: string | null;
  BirthDate: string | null; // date-only
  New_MemberNo: string | null; // a custom field: the publisher prefix New_ is part of the name
  New_SchemeStatus: number | null; // option set: 100000000 Active, 100000001 Deferred, 100000002 Retired, ...
  _ParentCustomerId_Value: string | null; // lookup to Accounts, exposed as a GUID with this odd name
  StateCode: number; // 0 Active, 1 Inactive
  ModifiedOn: string;
  VersionNumber: number;
}

export interface CrmAccount {
  "@odata.etag": string;
  AccountId: string;
  Name: string | null;
  AccountNumber: string | null;
  IndustryCode: number | null; // option set: 1 Manufacturing, 2 Services, 3 Retail
  StateCode: number;
  ModifiedOn: string;
  VersionNumber: number;
}

export interface CrmPage<T> {
  "@odata.context": string;
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
  value: T[];
}

export interface CrmWebhook {
  EventId: string;
  MessageName: "Create" | "Update" | "Delete";
  PrimaryEntityName: string;
  PrimaryEntityId: string;
  OperationCreatedOn: string;
}

// $select lists: ask only for what the translator reads. Unselected fields (notes, phone) never cross the boundary.
export const CONTACT_FIELDS = ["ContactId", "FirstName", "LastName", "EMailAddress1", "BirthDate", "New_MemberNo", "New_SchemeStatus", "_ParentCustomerId_Value", "StateCode", "ModifiedOn", "VersionNumber"] as const;
export const ACCOUNT_FIELDS = ["AccountId", "Name", "AccountNumber", "IndustryCode", "StateCode", "ModifiedOn", "VersionNumber"] as const;
