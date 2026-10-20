import { describe, expect, it } from "vitest";
import { resolveDataDir } from "../src/config.js";

describe("resolveDataDir", () => {
  it("prefers the explicit override", () => {
    expect(
      resolveDataDir({
        env: { DCV_DATA_DIR: "/custom/data" },
        platform: "linux",
        home: "/home/test"
      })
    ).toBe("/custom/data");
  });

  it("uses XDG_DATA_HOME on Linux", () => {
    expect(
      resolveDataDir({
        env: { XDG_DATA_HOME: "/xdg" },
        platform: "linux",
        home: "/home/test"
      })
    ).toBe("/xdg/dcv");
  });

  it("falls back to the Linux data directory", () => {
    expect(resolveDataDir({ env: {}, platform: "linux", home: "/home/test" })).toBe(
      "/home/test/.local/share/dcv"
    );
  });

  it("uses Application Support on macOS", () => {
    expect(resolveDataDir({ env: {}, platform: "darwin", home: "/Users/test" })).toBe(
      "/Users/test/Library/Application Support/DCV"
    );
  });

  it("uses APPDATA on Windows", () => {
    expect(
      resolveDataDir({
        env: { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
        platform: "win32",
        home: "C:\\Users\\test"
      })
    ).toBe("C:\\Users\\test\\AppData\\Roaming\\DCV");
  });
});
