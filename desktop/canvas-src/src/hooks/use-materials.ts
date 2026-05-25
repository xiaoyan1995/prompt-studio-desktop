"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface MaterialSuggestion {
  id: string;
  label: string;
  type: "image" | "video" | "audio";
  thumbnailUrl?: string;
  category: string;
  isMaterial: true;
}

export interface MaterialFolderSuggestion {
  id: string;
  label: string;
  materialCount: number;
  materials: MaterialSuggestion[];
}

interface MaterialItem {
  id: string;
  category: string;
  folder_id?: string | null;
  name: string;
  type: "IMAGE" | "VIDEO" | "AUDIO";
  storage_key: string;
  thumbnail_url?: string;
}

interface FolderItem {
  id: string;
  name: string;
  material_count: number;
}

let cachedMaterials: MaterialItem[] = [];
let cachedFolders: FolderItem[] = [];
let cacheTs = 0;
const CACHE_TTL = 30_000; // 30s

export function useMaterials() {
  const [materials, setMaterials] = useState<MaterialItem[]>(cachedMaterials);
  const [folders, setFolders] = useState<FolderItem[]>(cachedFolders);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async (force = false) => {
    if (!force && Date.now() - cacheTs < CACHE_TTL && (cachedMaterials.length > 0 || cachedFolders.length > 0)) {
      setMaterials(cachedMaterials);
      setFolders(cachedFolders);
      return;
    }
    setLoading(true);
    try {
      const [matRes, folderRes] = await Promise.all([
        fetch("/api/materials?limit=200"),
        fetch("/api/materials/folders"),
      ]);
      if (matRes.ok) {
        const data = await matRes.json();
        cachedMaterials = data.materials ?? [];
        if (mountedRef.current) setMaterials(cachedMaterials);
      }
      if (folderRes.ok) {
        const data = await folderRes.json();
        cachedFolders = data.folders ?? [];
        if (mountedRef.current) setFolders(cachedFolders);
      }
      cacheTs = Date.now();
    } catch {}
    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => { mountedRef.current = false; };
  }, [fetchAll]);

  const suggestions: MaterialSuggestion[] = materials.map((m) => ({
    id: `material-${m.id}`,
    label: m.name,
    type: m.type.toLowerCase() as "image" | "video" | "audio",
    thumbnailUrl: m.thumbnail_url,
    category: m.category,
    isMaterial: true as const,
  }));

  // Group materials by folder for folder-based suggestion UI
  const folderSuggestions: MaterialFolderSuggestion[] = folders.map((f) => ({
    id: f.id,
    label: f.name,
    materialCount: f.material_count,
    materials: materials
      .filter((m) => m.folder_id === f.id)
      .map((m) => ({
        id: `material-${m.id}`,
        label: m.name,
        type: m.type.toLowerCase() as "image" | "video" | "audio",
        thumbnailUrl: m.thumbnail_url,
        category: m.category,
        isMaterial: true as const,
      })),
  }));

  return { materials, suggestions, folderSuggestions, loading, refetch: () => fetchAll(true) };
}

export function invalidateMaterialCache() {
  cacheTs = 0;
  cachedMaterials = [];
  cachedFolders = [];
}
