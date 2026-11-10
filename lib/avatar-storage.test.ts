import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateBlockieAvatar,
  getProfileMetadata,
  saveProfileMetadata,
  deleteProfileAvatar,
  uploadAvatarToIpfs,
  getIpfsGatewayUrl,
  computeIpfsCid,
  DEFAULT_IPFS_GATEWAY,
} from "./avatar-storage";

describe("avatar-storage", () => {
  const TEST_KEY = "GABCDE1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("generateBlockieAvatar", () => {
    it("generates deterministic SVG data URI for a public key", () => {
      const uri1 = generateBlockieAvatar(TEST_KEY);
      const uri2 = generateBlockieAvatar(TEST_KEY);
      expect(uri1).toBe(uri2);
      expect(uri1).toContain("data:image/svg+xml;utf8,");
      expect(uri1).toContain("svg");
    });

    it("generates distinct patterns for different public keys", () => {
      const otherKey = "GOTHER1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF";
      const uri1 = generateBlockieAvatar(TEST_KEY);
      const uri2 = generateBlockieAvatar(otherKey);
      expect(uri1).not.toBe(uri2);
    });
  });

  describe("getIpfsGatewayUrl", () => {
    it("formats standard CID gateway URL", () => {
      const cid = "bafybeicmockcid123";
      expect(getIpfsGatewayUrl(cid)).toBe(`${DEFAULT_IPFS_GATEWAY}/${cid}`);
    });

    it("strips ipfs:// prefix if present", () => {
      const cid = "ipfs://bafybeicmockcid456";
      expect(getIpfsGatewayUrl(cid)).toBe(`${DEFAULT_IPFS_GATEWAY}/bafybeicmockcid456`);
    });
  });

  describe("metadata persistence", () => {
    it("saves and retrieves profile metadata", () => {
      expect(getProfileMetadata(TEST_KEY)).toBeNull();

      const saved = saveProfileMetadata(TEST_KEY, {
        avatarCid: "bafybeic123",
        avatarUrl: "https://example.com/avatar.png",
      });

      expect(saved.publicKey).toBe(TEST_KEY);
      expect(saved.avatarCid).toBe("bafybeic123");

      const retrieved = getProfileMetadata(TEST_KEY);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.avatarCid).toBe("bafybeic123");
    });

    it("deletes uploaded avatar while preserving metadata container", () => {
      saveProfileMetadata(TEST_KEY, { avatarCid: "bafybeic123" });
      deleteProfileAvatar(TEST_KEY);

      const retrieved = getProfileMetadata(TEST_KEY);
      expect(retrieved?.avatarCid).toBeUndefined();
    });
  });

  describe("computeIpfsCid", () => {
    it("computes a valid CID string", async () => {
      const bytes = new TextEncoder().encode("test-avatar-data");
      const cid = await computeIpfsCid(bytes);
      expect(cid).toMatch(/^bafybei[a-z0-9]+$/);
    });
  });

  describe("uploadAvatarToIpfs", () => {
    it("rejects non-image files", async () => {
      const file = new File(["dummy text content"], "doc.txt", { type: "text/plain" });
      await expect(uploadAvatarToIpfs(TEST_KEY, file)).rejects.toThrow(/Unsupported image format/);
    });

    it("rejects files exceeding size limit", async () => {
      const largeData = new Uint8Array(6 * 1024 * 1024);
      const file = new File([largeData], "large.png", { type: "image/png" });
      await expect(uploadAvatarToIpfs(TEST_KEY, file)).rejects.toThrow(/5MB/);
    });

    it("successfully uploads valid image and stores CID", async () => {
      const file = new File(["image-bytes-mock"], "avatar.png", { type: "image/png" });
      const result = await uploadAvatarToIpfs(TEST_KEY, file);

      expect(result.cid).toMatch(/^bafybei/);
      expect(result.gatewayUrl).toContain(result.cid);
      expect(result.metadata.avatarCid).toBe(result.cid);

      const stored = getProfileMetadata(TEST_KEY);
      expect(stored?.avatarCid).toBe(result.cid);
    });
  });
});
