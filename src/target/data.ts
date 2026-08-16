export type Account = {
  type: string;
  number: string;
  balance: string;
  status: string;
};

export type Member = {
  id: string;
  name: string;
  status: string;
  since: string;
  accounts: Account[];
};

export const MEMBERS: Record<string, Member> = {
  "12345": {
    id: "12345",
    name: "Jane Doe",
    status: "Active",
    since: "2014-03-11",
    accounts: [
      { type: "Savings", number: "****4412", balance: "$4,250.18", status: "Open" },
      { type: "Checking", number: "****1098", balance: "$890.00", status: "Open" },
    ],
  },
  "22222": {
    id: "22222",
    name: "Robert Chen",
    status: "Active",
    since: "2018-09-02",
    accounts: [{ type: "Savings", number: "****7731", balance: "$12,000.00", status: "Open" }],
  },
  "88888": {
    id: "88888",
    name: "Restricted Record",
    status: "Restricted",
    since: "2009-01-15",
    accounts: [],
  },
};

export const DENIED = new Set(["88888"]);
