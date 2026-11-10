"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  getProfileMetadata,
  uploadAvatarToIpfs,
  deleteProfileAvatar,
  generateBlockieAvatar,
  getIpfsGatewayUrl,
  type ProfileMetadata,
} from "@/lib/avatar-storage";
import { Upload, Trash2 } from "lucide-react";

interface AvatarUploadProps {
  publicKey: string;
}

export function AvatarUpload({ publicKey }: AvatarUploadProps) {
  const [metadata, setMetadata] = useState<ProfileMetadata | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (publicKey) {
      setMetadata(getProfileMetadata(publicKey));
      setImgError(false);
      setError(null);
      setSuccess(null);
    }
  }, [publicKey]);

  const defaultBlockie = generateBlockieAvatar(publicKey, 80);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await uploadAvatarToIpfs(publicKey, file);
      setMetadata(result.metadata);
      setImgError(false);
      setSuccess("Avatar uploaded to IPFS successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar to IPFS.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = () => {
    deleteProfileAvatar(publicKey);
    setMetadata(null);
    setImgError(false);
    setSuccess("Avatar removed. Reset to default blockie.");
    setError(null);
  };

  const currentAvatarSrc =
    metadata?.avatarCid && !imgError
      ? metadata.avatarUrl || getIpfsGatewayUrl(metadata.avatarCid)
      : defaultBlockie;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div className="relative group shrink-0">
        <img
          src={currentAvatarSrc}
          alt="User Avatar"
          onError={() => setImgError(true)}
          className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shadow-sm"
          data-testid="profile-avatar-img"
        />
        {metadata?.avatarCid && (
          <span
            className="absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-600 text-white rounded-full shadow"
            title="Stored on IPFS / Web3.Storage"
          >
            IPFS
          </span>
        )}
      </div>

      <div className="flex-1 space-y-1.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Profile Avatar</span>
          {metadata?.avatarCid ? (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              Custom IPFS Avatar
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              Default Blockie
            </span>
          )}
        </div>

        {metadata?.avatarCid && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-mono">
            <span>CID:</span>
            <a
              href={getIpfsGatewayUrl(metadata.avatarCid)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[200px] sm:max-w-[280px]"
              title={metadata.avatarCid}
            >
              {metadata.avatarCid}
            </a>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            onChange={handleFileChange}
            className="hidden"
            data-testid="avatar-file-input"
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Uploading to IPFS…" : metadata?.avatarCid ? "Change Avatar" : "Upload Avatar"}
          </button>

          {metadata?.avatarCid && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 py-1 px-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Reset to blockie
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 pt-1" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-green-600 dark:text-green-400 pt-1" role="status">
            {success}
          </p>
        )}
      </div>
    </div>
  );
}
