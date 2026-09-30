import localforage from "localforage";

export interface NoteMetadata {
  id: number;
  title: string;
  preview: string;
  date: string;
  category: string;
  styles: any;
  isLocked: boolean;
  password?: string;
  word_count?: number;
  char_count?: number;
  updated_at?: number;
  created_at?: number;
}

export interface NoteSavePayload {
  id?: number;
  title: string;
  content: string;
  preview?: string;
  date?: string;
  category?: string;
  styles?: any;
  isLocked?: boolean;
  password?: string;
}

export interface ImportBatchResult {
  imported: NoteMetadata[];
  failed: { id: any; title: string; reason: string }[];
  isCancelled?: boolean;
}

// Helpers
export function computeTextStats(htmlContent: string): { wordCount: number; charCount: number; preview: string } {
  if (!htmlContent) {
    return { wordCount: 0, charCount: 0, preview: "" };
  }
  const clean = (htmlContent || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/&zwnj;/gi, "")
    .replace(/&rlm;/gi, "")
    .replace(/&lrm;/gi, "")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = clean === "" ? 0 : clean.split(/\s+/).filter(Boolean).length;
  const charCount = clean.length;
  const preview = clean.substring(0, 100) + (clean.length > 100 ? "..." : "");
  return { wordCount, charCount, preview };
}

class MemoryStore {
  private items = new Map<string, any>();
  async getItem<T>(key: string): Promise<T | null> {
    return this.items.has(key) ? (this.items.get(key) as T) : null;
  }
  async setItem<T>(key: string, value: T): Promise<T> {
    this.items.set(key, value);
    return value;
  }
  async removeItem(key: string): Promise<void> {
    this.items.delete(key);
  }
  async keys(): Promise<string[]> {
    return Array.from(this.items.keys());
  }
}

function createSafeStore(storeName: string) {
  const lf = localforage.createInstance({ name: "DarAlHikayat", storeName });
  const mem = new MemoryStore();
  return {
    async getItem<T>(key: string): Promise<T | null> {
      try {
        return await lf.getItem<T>(key);
      } catch (e) {
        return await mem.getItem<T>(key);
      }
    },
    async setItem<T>(key: string, value: T): Promise<T> {
      try {
        return await lf.setItem<T>(key, value);
      } catch (e) {
        return await mem.setItem<T>(key, value);
      }
    },
    async removeItem(key: string): Promise<void> {
      try {
        await lf.removeItem(key);
      } catch (e) {
        await mem.removeItem(key);
      }
    },
    async keys(): Promise<string[]> {
      try {
        return await lf.keys();
      } catch (e) {
        return await mem.keys();
      }
    },
  };
}

const metaStore = createSafeStore("stories_meta");
const bodyStore = createSafeStore("story_bodies");
const appMetaStore = createSafeStore("app_meta");

let lastGeneratedId = 0;
function generateUniqueStoryId(): number {
  const now = Date.now();
  if (now > lastGeneratedId) {
    lastGeneratedId = now;
  } else {
    lastGeneratedId += 1;
  }
  return lastGeneratedId;
}

class StorageServiceManager {
  private db: any = null;
  private isNativeSQLite = false;
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isNativeSQLite = false;
    this.isInitialized = true;
    this.migrateLegacyDataIfNeeded().catch((e) => console.warn("Migration warning:", e));
  }

  public async backfillFtsIfNeeded(): Promise<void> {
    if (!this.isNativeSQLite || !this.db) return;
    try {
      const res = await this.db.query("SELECT value FROM app_meta WHERE key = 'fts_backfilled_v2'");
      if (res.values && res.values.length > 0 && res.values[0].value === "true") return;

      const all = await this.db.query("SELECT s.id, s.title, sb.html FROM stories s LEFT JOIN story_bodies sb ON s.id = sb.story_id;");
      if (all.values && all.values.length > 0) {
        for (const row of all.values) {
          const plainBody = (row.html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          await this.db.run("INSERT OR REPLACE INTO stories_fts (rowid, title, body) VALUES (?, ?, ?);", [row.id, row.title || "", plainBody]);
        }
      }
      await this.db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('fts_backfilled_v2', 'true');");
    } catch (err) {
      console.warn("FTS backfill error:", err);
    }
  }

  private async migrateLegacyDataIfNeeded(): Promise<void> {
    try {
      let isMigrated = false;
      if (this.isNativeSQLite) {
        try {
          const res = await this.db.query("SELECT value FROM app_meta WHERE key = 'migrated_to_sqlite_v3'");
          isMigrated = res.values && res.values.length > 0 && res.values[0].value === "true";
        } catch (e) {
          isMigrated = false;
        }
      } else {
        const val = await appMetaStore.getItem<string>("migrated_to_sqlite_v3");
        isMigrated = val === "true";
      }

      if (isMigrated) return;

      console.log("Migration check: Loading legacy notes for migration...");
      let legacyNotes: any[] = [];
      const v2Notes = await localforage.getItem<any[]>("dar_notes_v2");
      if (Array.isArray(v2Notes) && v2Notes.length > 0) {
        legacyNotes = v2Notes;
      } else {
        const rawLs = typeof window !== "undefined" ? localStorage.getItem("dar_notes") : null;
        if (rawLs) {
          try { legacyNotes = JSON.parse(rawLs); } catch (e) {}
        }
      }

      if (Array.isArray(legacyNotes) && legacyNotes.length > 0) {
        console.log(`Migrating ${legacyNotes.length} legacy stories to split storage...`);
        const result = await this.importBatch(legacyNotes);
        console.log(`Migration result: ${result.imported.length} succeeded, ${result.failed.length} failed.`);
        if (result.failed.length === 0) {
          if (this.isNativeSQLite) {
            await this.db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);", ["migrated_to_sqlite_v3", "true"]);
          } else {
            await appMetaStore.setItem("migrated_to_sqlite_v3", "true");
          }
        }
      } else {
        if (this.isNativeSQLite) {
          await this.db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);", ["migrated_to_sqlite_v3", "true"]);
        } else {
          await appMetaStore.setItem("migrated_to_sqlite_v3", "true");
        }
      }
    } catch (err) {
      console.error("Migration error:", err);
    }
  }

  async loadNotesMetadata(): Promise<NoteMetadata[]> {
    await this.init();
    if (this.isNativeSQLite) {
      const res = await this.db.query("SELECT id, title, preview, date, category, styles, is_locked, password, word_count, char_count, updated_at, created_at FROM stories ORDER BY id DESC;");
      if (!res.values) return [];
      return res.values.map((row: any) => this.mapRowToMetadata(row));
    } else {
      const keys = await metaStore.keys();
      const metadataList: NoteMetadata[] = [];
      for (const key of keys) {
        const item = await metaStore.getItem<NoteMetadata>(key);
        if (item) {
          let wCount = typeof item.word_count === "number" && item.word_count > 0 ? item.word_count : 0;
          let cCount = typeof item.char_count === "number" && item.char_count > 0 ? item.char_count : 0;
          if (wCount === 0 && item.preview) {
            const s = computeTextStats(item.preview);
            wCount = s.wordCount;
            cCount = s.charCount;
          }
          metadataList.push({
            ...item,
            word_count: wCount,
            char_count: cCount,
          });
        }
      }
      metadataList.sort((a, b) => b.id - a.id);
      return metadataList;
    }
  }

  private mapRowToMetadata(row: any): NoteMetadata {
    let wCount = typeof row.word_count === "number" && row.word_count > 0 ? row.word_count : 0;
    let cCount = typeof row.char_count === "number" && row.char_count > 0 ? row.char_count : 0;
    const previewText = row.preview || "";
    if (wCount === 0 && previewText) {
      const s = computeTextStats(previewText);
      wCount = s.wordCount;
      cCount = s.charCount;
    }

    return {
      id: row.id,
      title: row.title || "بدون عنوان",
      preview: previewText,
      date: row.date || "",
      category: row.category || "حكاية",
      styles: typeof row.styles === "string" ? JSON.parse(row.styles) : row.styles,
      isLocked: !!row.is_locked,
      password: row.password || "",
      word_count: wCount,
      char_count: cCount,
      updated_at: row.updated_at || Date.now(),
      created_at: row.created_at || Date.now(),
    };
  }

  async searchStories(searchTerm: string): Promise<NoteMetadata[]> {
    await this.init();
    const cleanTerm = searchTerm.trim();
    if (!cleanTerm) {
      return this.loadNotesMetadata();
    }

    const words = cleanTerm.split(/\s+/).filter(Boolean);
    if (words.length === 0) return this.loadNotesMetadata();

    if (this.isNativeSQLite) {
      const ftsMatches: NoteMetadata[] = [];
      const seenIds = new Set<number>();

      let isFtsComplete = false;
      try {
        const cntRes = await this.db.query(
          "SELECT (SELECT COUNT(*) FROM stories_fts) as fts_cnt, (SELECT COUNT(*) FROM stories) as total_cnt;"
        );
        if (cntRes.values && cntRes.values.length > 0) {
          const { fts_cnt, total_cnt } = cntRes.values[0];
          isFtsComplete = total_cnt > 0 && fts_cnt >= total_cnt;
        }
      } catch (e) {}

      if (isFtsComplete) {
        try {
          const ftsMatchStr = words.map((w) => `${w.replace(/["*]/g, "")}*`).join(" ");
          const ftsQuery = `
            SELECT s.id, s.title, s.preview, s.date, s.category, s.styles, s.is_locked, s.password, s.word_count, s.char_count, s.updated_at, s.created_at
            FROM stories s
            JOIN stories_fts fts ON s.id = fts.rowid
            WHERE stories_fts MATCH ?
            ORDER BY bm25(stories_fts);
          `;
          const res = await this.db.query(ftsQuery, [ftsMatchStr]);
          if (res.values && res.values.length > 0) {
            for (const row of res.values) {
              const meta = this.mapRowToMetadata(row);
              ftsMatches.push(meta);
              seenIds.add(meta.id);
            }
          }
        } catch (err) {
          console.warn("FTS search failed, continuing to LIKE search:", err);
        }
      }

      // Parameterized substring LIKE search to guarantee zero missed Arabic infixes/prefixes
      const likeConditions = words.map(() => "(title LIKE ? OR preview LIKE ?)").join(" AND ");
      const likeQuery = `
        SELECT id, title, preview, date, category, styles, is_locked, password, word_count, char_count, updated_at, created_at
        FROM stories
        WHERE ${likeConditions}
        ORDER BY id DESC;
      `;
      const params: string[] = [];
      for (const w of words) {
        const p = `%${w}%`;
        params.push(p, p);
      }
      const likeRes = await this.db.query(likeQuery, params);
      const combined: NoteMetadata[] = [...ftsMatches];

      if (likeRes.values && likeRes.values.length > 0) {
        for (const row of likeRes.values) {
          const meta = this.mapRowToMetadata(row);
          if (!seenIds.has(meta.id)) {
            combined.push(meta);
            seenIds.add(meta.id);
          }
        }
      }

      return combined;
    } else {
      const all = await this.loadNotesMetadata();
      return all.filter((n) => {
        const fullText = `${n.title || ""} ${n.preview || ""}`.toLowerCase();
        return words.every((w) => fullText.includes(w.toLowerCase()));
      });
    }
  }

  async getStoryBody(storyId: number): Promise<string> {
    await this.init();
    if (this.isNativeSQLite) {
      const res = await this.db.query("SELECT html FROM story_bodies WHERE story_id = ?;", [storyId]);
      if (res.values && res.values.length > 0) {
        return res.values[0].html || "";
      }
      return "";
    } else {
      const html = await bodyStore.getItem<string>(String(storyId));
      return html || "";
    }
  }

  async saveStory(payload: NoteSavePayload): Promise<NoteMetadata> {
    await this.init();
    const now = Date.now();
    const id = payload.id || generateUniqueStoryId();
    const stats = computeTextStats(payload.content);

    const formattedDate = payload.date || new Date().toLocaleDateString("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    let existingCreatedAt: number = now;
    if (!this.isNativeSQLite && payload.id) {
      const existingMeta = await metaStore.getItem<NoteMetadata>(String(id));
      if (existingMeta && existingMeta.created_at) {
        existingCreatedAt = existingMeta.created_at;
      }
    }

    const metadata: NoteMetadata = {
      id,
      title: payload.title || "بدون عنوان",
      preview: payload.preview || stats.preview,
      date: formattedDate,
      category: payload.category || "حكاية",
      styles: payload.styles || {
        fontSize: 18,
        fontWeight: 400,
        textAlign: "right",
        textColor: "#121A1B",
        paperStyleIndex: 0,
      },
      isLocked: !!payload.isLocked,
      password: payload.password || "",
      word_count: stats.wordCount,
      char_count: stats.charCount,
      updated_at: now,
      created_at: existingCreatedAt,
    };

    if (this.isNativeSQLite) {
      const stylesJson = typeof metadata.styles === "string" ? metadata.styles : JSON.stringify(metadata.styles);
      // Strictly parameterized query via executeSet transaction - NO user string interpolation!
      await this.db.executeSet([
        {
          statement: `INSERT OR REPLACE INTO stories (id,title,preview,date,category,styles,is_locked,password,word_count,char_count,updated_at,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?))`,
          values: [id, metadata.title, metadata.preview, metadata.date, metadata.category, stylesJson, metadata.isLocked ? 1 : 0, metadata.password || "", metadata.word_count, metadata.char_count, now, id, now]
        },
        {
          statement: `INSERT OR REPLACE INTO story_bodies (story_id, html) VALUES (?,?)`,
          values: [id, payload.content]
        }
      ], true);

      try {
        const plainBody = (payload.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        await this.db.run(`INSERT OR REPLACE INTO stories_fts (rowid, title, body) VALUES (?,?,?)`, [id, metadata.title, plainBody]);
      } catch (ftsErr) {}
    } else {
      await metaStore.setItem(String(id), metadata);
      await bodyStore.setItem(String(id), payload.content);
    }

    return metadata;
  }

  async deleteStories(ids: number[]): Promise<void> {
    await this.init();
    if (ids.length === 0) return;

    if (this.isNativeSQLite) {
      const CHUNK_SIZE = 800;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(",");

        // 1. Data deletion in atomic transaction
        await this.db.executeSet([
          { statement: `DELETE FROM stories WHERE id IN (${placeholders})`, values: chunk },
          { statement: `DELETE FROM story_bodies WHERE story_id IN (${placeholders})`, values: chunk },
        ], true);

        // 2. FTS index deletion in separate non-blocking call (index failure must never prevent data deletion)
        try {
          await this.db.run(`DELETE FROM stories_fts WHERE rowid IN (${placeholders})`, chunk);
        } catch (ftsErr) {
          console.warn("FTS deletion warning (non-fatal):", ftsErr);
        }
      }
    } else {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.flatMap((id) => [
            metaStore.removeItem(String(id)),
            bodyStore.removeItem(String(id)),
          ])
        );
      }
    }
  }

  async importBatch(
    rawStories: any[],
    onProgress?: (processed: number, total: number) => void,
    abortSignal?: AbortSignal
  ): Promise<ImportBatchResult> {
    await this.init();
    const total = rawStories.length;
    const importedMetadata: NoteMetadata[] = [];
    const failed: { id: any; title: string; reason: string }[] = [];
    const chunkSize = 25;

    for (let i = 0; i < total; i += chunkSize) {
      if (abortSignal?.aborted) {
        break;
      }
      const chunk = rawStories.slice(i, i + chunkSize);

      for (const item of chunk) {
        if (abortSignal?.aborted) break;
        if (!item || (!item.title && !item.content)) continue;

        const now = Date.now();
        const id = item.id || now + Math.floor(Math.random() * 100000);
        const stats = computeTextStats(item.content || "");
        const formattedDate = item.date || new Date().toLocaleDateString("ar-EG", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        const meta: NoteMetadata = {
          id,
          title: item.title || "بدون عنوان",
          preview: item.preview || stats.preview,
          date: formattedDate,
          category: item.category || "حكاية مستوردة",
          styles: item.styles || {
            fontSize: 18,
            fontWeight: 400,
            textAlign: "right",
            textColor: "#121A1B",
            paperStyleIndex: 0,
          },
          isLocked: !!item.isLocked,
          password: item.password || "",
          word_count: item.word_count || stats.wordCount,
          char_count: item.char_count || stats.charCount,
          updated_at: now,
          created_at: item.created_at || now,
        };

        // Retry mechanism: try 2 attempts per story
        let success = false;
        let lastError = "";

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            if (this.isNativeSQLite) {
              const stylesJson = typeof meta.styles === "string" ? meta.styles : JSON.stringify(meta.styles);
              await this.db.executeSet([
                {
                  statement: `INSERT OR REPLACE INTO stories (id,title,preview,date,category,styles,is_locked,password,word_count,char_count,updated_at,created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?, COALESCE((SELECT created_at FROM stories WHERE id = ?), ?))`,
                  values: [id, meta.title, meta.preview, meta.date, meta.category, stylesJson, meta.isLocked ? 1 : 0, meta.password || "", meta.word_count, meta.char_count, now, id, meta.created_at]
                },
                {
                  statement: `INSERT OR REPLACE INTO story_bodies (story_id, html) VALUES (?,?)`,
                  values: [id, item.content || ""]
                }
              ], true);

              try {
                await this.db.run(`INSERT OR REPLACE INTO stories_fts (rowid, title, body) VALUES (?,?,?)`, [id, meta.title, item.content || ""]);
              } catch (ftsErr) {}
            } else {
              await metaStore.setItem(String(id), meta);
              await bodyStore.setItem(String(id), item.content || "");
            }
            success = true;
            break;
          } catch (err: any) {
            lastError = err?.message || String(err);
          }
        }

        if (success) {
          importedMetadata.push(meta);
        } else {
          failed.push({
            id,
            title: item.title || "بدون عنوان",
            reason: lastError || "فشل الكتابة في قاعدة البيانات",
          });
        }
      }

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, total), total);
      }

      // Yield frame to UI
      await new Promise((r) => setTimeout(r, 0));
    }

    return {
      imported: importedMetadata,
      failed,
      isCancelled: !!abortSignal?.aborted,
    };
  }

  async exportFullBackupBlob(): Promise<Blob> {
    await this.init();
    const metadataList = await this.loadNotesMetadata();
    const chunks: string[] = ["[\n"];

    for (let i = 0; i < metadataList.length; i++) {
      const meta = metadataList[i];
      const html = await this.getStoryBody(meta.id);
      const item = {
        id: meta.id,
        title: meta.title,
        preview: meta.preview,
        date: meta.date,
        category: meta.category,
        styles: meta.styles,
        isLocked: meta.isLocked,
        password: meta.password || "",
        word_count: meta.word_count || 0,
        char_count: meta.char_count || 0,
        updated_at: meta.updated_at,
        created_at: meta.created_at,
        content: html,
      };
      const itemJson = JSON.stringify(item, null, 2)
        .split("\n")
        .map((line) => "  " + line)
        .join("\n");

      chunks.push(itemJson);
      if (i < metadataList.length - 1) {
        chunks.push(",\n");
      } else {
        chunks.push("\n");
      }
    }

    chunks.push("]");
    return new Blob(chunks, { type: "application/json;charset=utf-8" });
  }
}

export const StorageService = new StorageServiceManager();
