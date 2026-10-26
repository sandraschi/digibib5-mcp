import { useCallback, useEffect, useState } from "react";
import { api, type TextResponse, type TocNode, type VolumeRef } from "./lib/api";

// ------------------------------------------------------------------ TOC tree

function TreeNode({
  node,
  activeIndex,
  onPick,
}: {
  node: TocNode;
  activeIndex: number | null;
  onPick: (n: TocNode) => void;
}) {
  const [open, setOpen] = useState(node.depth < 1);
  const hasKids = (node.children && node.children.length > 0) || !!node.children_count;
  const active = node.index === activeIndex;
  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm ${
          active ? "bg-sky-600/30 text-sky-200" : "hover:bg-white/5 text-gray-300"
        }`}
      >
        <button
          className="w-4 shrink-0 text-gray-500 hover:text-gray-300"
          onClick={() => hasKids && setOpen((o) => !o)}
          aria-label={hasKids ? (open ? "collapse" : "expand") : undefined}
        >
          {hasKids ? (open ? "\u25be" : "\u25b8") : ""}
        </button>
        <button className="flex-1 truncate text-left" title={node.title} onClick={() => onPick(node)}>
          {node.title || "(untitled)"}
        </button>
      </div>
      {open && node.children && (
        <ul className="ml-4 border-l border-white/5 pl-2">
          {node.children.map((c) => (
            <TreeNode key={c.index} node={c} activeIndex={activeIndex} onPick={onPick} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ------------------------------------------------------------------- app

export default function App() {
  const [volumes, setVolumes] = useState<VolumeRef[]>([]);
  const [vid, setVid] = useState<string>("");
  const [tocTitle, setTocTitle] = useState("");
  const [toc, setToc] = useState<TocNode[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [activeNode, setActiveNode] = useState<number | null>(null);
  const [content, setContent] = useState<TextResponse | null>(null);
  const [recInput, setRecInput] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .volumes()
      .then((r) => setVolumes(r.volumes))
      .catch((e) => setError(String(e)));
  }, []);

  const loadVolume = useCallback(async (id: string) => {
    setVid(id);
    setToc([]);
    setContent(null);
    setActiveNode(null);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      const t = await api.toc(id);
      setToc(t.toc);
      setTocTitle(t.title);
      setRecordCount(t.record_count);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const pickNode = useCallback(
    async (n: TocNode) => {
      setActiveNode(n.index);
      setError(null);
      setLoading(true);
      try {
        setContent(await api.nodeText(vid, n.index));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [vid],
  );

  const showRecord = useCallback(
    async (idx: number) => {
      if (!vid || idx < 0 || idx >= recordCount) return;
      setActiveNode(null);
      setRecInput(String(idx));
      setError(null);
      setLoading(true);
      try {
        setContent(await api.recordText(vid, idx));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [vid, recordCount],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#0e1420] px-4 py-2.5">
        <span className="text-lg font-semibold tracking-tight text-sky-300">Digibib5 Reader</span>
        <select
          className="ml-2 max-w-[48ch] rounded border border-white/10 bg-[#121a28] px-2 py-1 text-sm text-gray-200"
          value={vid}
          onChange={(e) => loadVolume(e.target.value)}
        >
          <option value="">Choose a CD-ROM volume...</option>
          {volumes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} - {v.title}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-500">{volumes.length} discs - K:\Digitale Bibliothek</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* TOC pane */}
        <aside className="flex w-[34%] min-w-[280px] max-w-[460px] flex-col border-r border-white/10 bg-[#0c1220]">
          <div className="border-b border-white/5 px-3 py-2">
            <div className="truncate text-sm font-medium text-gray-200" title={tocTitle}>
              {tocTitle || "Table of contents"}
            </div>
            {recordCount > 0 && (
              <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                <span>{recordCount} records</span>
                <span className="mx-1">-</span>
                <span>jump to #</span>
                <input
                  className="w-16 rounded border border-white/10 bg-[#121a28] px-1 py-0.5 text-gray-200"
                  value={recInput}
                  onChange={(e) => setRecInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && showRecord(Number(recInput))}
                />
                <button
                  className="rounded bg-sky-700/50 px-1.5 py-0.5 text-sky-200 hover:bg-sky-700"
                  onClick={() => showRecord(Number(recInput))}
                >
                  go
                </button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {toc.length === 0 ? (
              <p className="px-2 py-4 text-sm text-gray-500">
                {vid ? "No table of contents." : "Select a volume to load its tree."}
              </p>
            ) : (
              <ul>
                {toc.map((n) => (
                  <TreeNode key={n.index} node={n} activeIndex={activeNode} onPick={pickNode} />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* content pane */}
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-6 py-5">
            {error && (
              <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}
            {loading && <div className="text-sm text-gray-500">Loading...</div>}
            {!loading && !content && !error && (
              <div className="mt-20 text-center text-gray-500">
                <p className="text-lg">Pick an entry from the tree, or jump to a record.</p>
                <p className="mt-2 text-sm">
                  Reverse-engineered reader for Directmedia's Digitale Bibliothek 5 discs.
                </p>
              </div>
            )}
            {content && (
              <article>
                <h1 className="mb-1 text-xl font-semibold text-gray-100">
                  {content.title ?? `Record ${content.record_index}`}
                </h1>
                <div className="mb-4 flex items-center gap-3 text-xs text-gray-500">
                  {content.node_index != null && <span>node #{content.node_index}</span>}
                  {content.record != null && content.record_end != null && (
                    <span>
                      records #{content.record}-{content.record_end - 1}
                      {content.records_total != null && content.records_total > 1 && (
                        <> ({content.records_total})</>
                      )}
                      {content.truncated && <> - truncated, chapter continues</>}
                    </span>
                  )}
                  {content.record != null && content.record_end == null && (
                    <span>record #{content.record}</span>
                  )}
                  {content.record_index != null && <span>record #{content.record_index}</span>}
                </div>
                    {content.text?.trim() ? (
                      <div className="record-prose text-gray-200" lang="de">
                        {content.text}
                      </div>
                    ) : (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    No text for this node. Try the "jump to #" record browser on the left to read
                    records directly.
                  </div>
                )}
                <p className="mt-6 border-t border-white/5 pt-3 text-xs text-gray-600">
                  Text decode is v1/approximate - readable but not yet byte-faithful. A chapter shows
                  all its records; the volume root is capped at 100.
                </p>
              </article>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
