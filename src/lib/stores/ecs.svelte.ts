class Entity {}

class Component {}

class System {
	private entitiesCache: Entity[] = [];
	private ECSStore: ECSStore;

	constructor(ECSStore: ECSStore) {
		this.ECSStore = ECSStore;
	}
}

class ECSStore {
	entities: Entity[] = [];
	components: Component[] = [];
	systems: System[] = [];
}
