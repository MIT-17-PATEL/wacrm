import { describe, expect, it } from "vitest";

import { personalFirstName } from "./display-name";

describe("personalFirstName", () => {
  it("uses the profile name as entered", () => {
    expect(personalFirstName({ profileName: "Mit Dharmeshbhai Patel" })).toBe("Mit");
    expect(personalFirstName({ profileName: "MIT PATEL" })).toBe("MIT");
  });

  it("never greets the workspace", () => {
    expect(
      personalFirstName({ profileName: "WA", workspaceName: "WA", metadataName: "Mit Patel" }),
    ).toBe("Mit");
    expect(
      personalFirstName({ profileName: "WA", workspaceName: "wa", email: "mitpatel@neno.com" }),
    ).toBe("Mitpatel");
  });

  it("falls back to the email local part", () => {
    expect(personalFirstName({ email: "priya.sharma@x.in" })).toBe("Priya");
    expect(personalFirstName({})).toBeNull();
  });
});
