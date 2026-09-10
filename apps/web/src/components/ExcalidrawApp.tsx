"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  Sidebar,
  WelcomeScreen,
  restore,
  restoreLibraryItems,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import {
  clearToken,
  createDrawing,
  deleteDrawing,
  fetchDrawing,
  fetchDrawings,
  fetchLibrary,
  getToken,
  saveLibrary,
  type Drawing,
  type DrawingSummary,
  updateDrawing,
} from "@/lib/api";
import { formatRelativeDate } from "@/lib/dates";

type SaveState = "saved" | "saving" | "error";

const CANVAS_ACTIONS = {
  canvasActions: {
    loadScene: true,
    saveToActiveFile: true,
    export: { saveFileToDisk: true },
    toggleTheme: true,
  },
} as const;

function serializeScene(
  elements: unknown,
  appState: unknown,
  files: unknown,
) {
  return serializeAsJSON(
    elements as Parameters<typeof serializeAsJSON>[0],
    appState as Parameters<typeof serializeAsJSON>[1],
    files as Parameters<typeof serializeAsJSON>[2],
    "database",
  );
}

export default function ExcalidrawApp() {
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [current, setCurrent] = useState<Drawing | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const lastSavedJsonRef = useRef("");
  const pendingJsonRef = useRef("");
  const primedRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const libraryTimer = useRef<number | null>(null);
  const libraryApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  currentIdRef.current = current?.id ?? null;

  const initialData = useMemo(() => {
    if (!current) return null;
    const restored = restore(current.data, null, null, {
      repairBindings: true,
    });
    return {
      elements: restored.elements,
      appState: {
        ...restored.appState,
        collaborators: new Map(),
      },
      files: restored.files,
      scrollToContent: true,
    };
  }, [current]);

  const loadLibrary = useCallback(async (api: ExcalidrawImperativeAPI) => {
    try {
      const { libraryItems } = await fetchLibrary();
      if (Array.isArray(libraryItems) && libraryItems.length > 0) {
        await api.updateLibrary({
          libraryItems: restoreLibraryItems(
            libraryItems as Parameters<typeof restoreLibraryItems>[0],
            "unpublished",
          ),
          merge: false,
        });
      }
    } catch {
      // library is optional
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!getToken()) {
        window.location.replace("/login");
        return;
      }

      const { drawings: list } = await fetchDrawings();
      if (cancelled) return;

      let selected = list[0];
      if (list.length === 0) {
        const created = await createDrawing("Sem título");
        if (cancelled) return;
        setDrawings([created.drawing]);
        setCurrent(created.drawing);
        primedRef.current = false;
        lastSavedJsonRef.current = "";
        setBootstrapping(false);
        return;
      }

      const lastId = window.localStorage.getItem("excalidraw.lastDrawingId");
      if (lastId && list.some((item) => item.id === lastId)) {
        selected = list.find((item) => item.id === lastId) ?? list[0];
      }

      const { drawing } = await fetchDrawing(selected.id);
      if (cancelled) return;
      window.localStorage.setItem("excalidraw.lastDrawingId", drawing.id);
      setDrawings(list);
      setCurrent(drawing);
      primedRef.current = false;
      lastSavedJsonRef.current = "";
      setBootstrapping(false);
    }

    bootstrap().catch(() => {
      if (!cancelled) {
        window.location.href = "/login";
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const openDrawing = useCallback(async (id: string) => {
    if (current?.id === id) return;
    const { drawing } = await fetchDrawing(id);
    window.localStorage.setItem("excalidraw.lastDrawingId", drawing.id);
    primedRef.current = false;
    lastSavedJsonRef.current = "";
    setCurrent(drawing);
    setSaveState("saved");
  }, [current?.id]);

  const handleChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      const drawingId = currentIdRef.current;
      if (!drawingId) return;

      const payload = serializeScene(elements, appState, files);
      pendingJsonRef.current = payload;

      if (!primedRef.current) {
        lastSavedJsonRef.current = payload;
        primedRef.current = true;
        return;
      }

      if (payload === lastSavedJsonRef.current) {
        return;
      }

      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        const toSave = pendingJsonRef.current;
        const id = currentIdRef.current;
        if (!id || toSave === lastSavedJsonRef.current) {
          return;
        }

        setSaveState("saving");
        try {
          const { drawing } = await updateDrawing(id, {
            data: JSON.parse(toSave) as Record<string, unknown>,
          });
          lastSavedJsonRef.current = toSave;
          setDrawings((items) =>
            items
              .map((item) =>
                item.id === drawing.id
                  ? { ...item, updatedAt: drawing.updatedAt }
                  : item,
              )
              .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
          );
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 1000);
    },
    [],
  );

  const handleLibraryChange = useCallback((items: LibraryItems) => {
    if (libraryTimer.current) window.clearTimeout(libraryTimer.current);
    libraryTimer.current = window.setTimeout(() => {
      void saveLibrary(items as unknown[]);
    }, 800);
  }, []);

  const handleNewDrawing = useCallback(async () => {
    const { drawing } = await createDrawing("Sem título");
    setDrawings((items) => [drawing, ...items]);
    primedRef.current = false;
    lastSavedJsonRef.current = "";
    setCurrent(drawing);
    window.localStorage.setItem("excalidraw.lastDrawingId", drawing.id);
    setSaveState("saved");
  }, []);

  const handleRename = useCallback(async (id: string, name: string) => {
    const { drawing } = await updateDrawing(id, { name });
    setDrawings((items) =>
      items.map((item) => (item.id === id ? { ...item, name: drawing.name } : item)),
    );
    setCurrent((item) =>
      item?.id === id ? { ...item, name: drawing.name } : item,
    );
    setRenamingId(null);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Excluir este desenho?")) return;
      await deleteDrawing(id);
      const remaining = drawings.filter((item) => item.id !== id);
      setDrawings(remaining);
      if (current?.id === id) {
        if (remaining[0]) {
          await openDrawing(remaining[0].id);
        } else {
          await handleNewDrawing();
        }
      }
    },
    [current?.id, drawings, handleNewDrawing, openDrawing],
  );

  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api;
      if (libraryApiRef.current === api) return;
      libraryApiRef.current = api;
      void loadLibrary(api);
    },
    [loadLibrary],
  );

  const renderTopRightUI = useCallback(() => {
    return (
      <div
        className={`save-pill${saveState === "saving" ? " is-saving" : ""}${saveState === "error" ? " is-error" : ""}`}
      >
        {saveState === "saving"
          ? "Salvando…"
          : saveState === "error"
            ? "Erro ao salvar"
            : "Salvo na nuvem"}
      </div>
    );
  }, [saveState]);

  if (bootstrapping || !current) {
    return (
      <div className="app-loading">
        <div>Carregando o editor…</div>
      </div>
    );
  }

  return (
    <div className="excalidraw-app-shell">
      <Excalidraw
        key={current.id}
        langCode="pt-BR"
        aiEnabled={false}
        isCollaborating={false}
        name={current.name}
        initialData={initialData}
        UIOptions={CANVAS_ACTIONS}
        excalidrawAPI={handleApiReady}
        onChange={handleChange}
        onLibraryChange={handleLibraryChange}
        renderTopRightUI={renderTopRightUI}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.Item
            onSelect={() => {
              apiRef.current?.toggleSidebar({ name: "drawings" });
            }}
          >
            Meus desenhos
          </MainMenu.Item>
          <MainMenu.Item onSelect={() => void handleNewDrawing()}>
            Novo desenho
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.Item
            onSelect={() => {
              clearToken();
              window.location.href = "/login";
            }}
          >
            Sair
          </MainMenu.Item>
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.HelpHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo />
            <WelcomeScreen.Center.Heading>
              {current.name}
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemLoadScene />
              <WelcomeScreen.Center.MenuItemHelp />
              <WelcomeScreen.Center.MenuItem
                onSelect={() => {
                  apiRef.current?.toggleSidebar({ name: "drawings" });
                }}
              >
                Meus desenhos
              </WelcomeScreen.Center.MenuItem>
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
        </WelcomeScreen>
        <Sidebar name="drawings">
          <Sidebar.Header>Desenhos</Sidebar.Header>
          <div className="drawings-sidebar">
            <div className="drawings-sidebar__actions">
              <button
                type="button"
                className="drawings-sidebar__button"
                onClick={() => void handleNewDrawing()}
              >
                Novo desenho
              </button>
            </div>
            <div className="drawings-list">
              {drawings.map((drawing) => (
                <div
                  key={drawing.id}
                  className={`drawings-item${drawing.id === current.id ? " is-active" : ""}`}
                  onClick={() => void openDrawing(drawing.id)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setRenamingId(drawing.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void openDrawing(drawing.id);
                  }}
                >
                  <div>
                    {renamingId === drawing.id ? (
                      <input
                        className="drawings-item__rename"
                        autoFocus
                        defaultValue={drawing.name}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={(event) => {
                          void handleRename(drawing.id, event.currentTarget.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            void handleRename(drawing.id, event.currentTarget.value);
                          }
                        }}
                      />
                    ) : (
                      <div className="drawings-item__name">{drawing.name}</div>
                    )}
                    <div className="drawings-item__meta">
                      {formatRelativeDate(drawing.updatedAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="drawings-item__delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(drawing.id);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Sidebar>
      </Excalidraw>
    </div>
  );
}
