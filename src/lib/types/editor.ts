export type MenuItem = {
    label?: string;
    shortcut?: string;
    separator?: boolean;
    action?: () => void;
};

export type StudioTab = {
    id: string;
    name: string;
    kind: "world" | "model" | "script" | "test";
    dirty: boolean;
    dataId?: string; // References the ID of the ModelData or WorldData this tab edits
};

export type WorkspaceKind = "world" | "model" | "script" | "test";
