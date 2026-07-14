type BaseEntityType = "part" | "model" | "light" | "camera" | "custom";

class Entity {
    id: string;
    name: string;
    baseEntity: BaseEntityType; // The base entity type determines the default components and behavior of the entity

    components: Component[] = [];

    children: Entity[] = [];
}

type ComponentDataEntry = {
    type: "string" | "number" | "boolean" | "vector3" | "color" | "texture";
    defaultValue: any;
    value: any;

    tooltip?: string;
};

class Component {
    id: string;
    name: string;
    tooltip?: string;

    data: Record<string, ComponentDataEntry> = {};
}

class System {
    id: string;
    name: string;
    tooltip?: string;

    relatedComponents: string[] = [];

    // The update function is called every frame with the delta time and the list of entities in the world.
    update(deltaTime: number, entities: Entity[]): void {}
}
