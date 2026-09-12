async function startPlayTest() {
		playTest.active = true;
		playTest.parts = [];
		console.log('Play test started');

		console.log('Creating play test scene...');
		playTest.scene = new THREE.Scene();
		playTest.scene.background = new THREE.Color(COLORS.sky);

		playTest.camera = new THREE.PerspectiveCamera(60, RES_W / RES_H, 0.1, 1000);
		playTest.camera.position.copy(camera.position);
		playTest.camera.lookAt(0, 0, 0);

		console.log('Initializing physics world for play test...');
		playTest.physicsWorld = new RAPIER.World(playTest.physicsGravity);

		async function initGameEngine() {
			const lua = await factory.createEngine();

			lua.global.set('printLog', (...args) => console.log(...args));

			lua.global.set('applyVelocity', (partName: string, x: number, y: number, z: number) => {
				console.log(`applyVelocity called for part "${partName}" with velocity (${x}, ${y}, ${z})`);
				const part = playTest.parts.find((p) => p.name === partName);
				if (part && part.physicsBody) {
					part.physicsBody.setLinvel({ x, y, z }, true);
				}
			});

			await lua.doString(editorState.scripts[0].code);

			const mainThread: LuaThread = lua.global.get('mainThread');

			function step() {
				const { result, resultCount } = mainThread.resume();

				if (result !== LuaReturn.Yield && result !== LuaReturn.Ok) {
					console.error('Game loop crashed with result code:', result);
					lua.global.close();
					return;
				}

				let waitSeconds = 0;
				if (resultCount > 0) {
					const [first] = mainThread.getStackValues(0);
					if (typeof first === 'number') {
						waitSeconds = first;
					}
					mainThread.pop(resultCount);
				}

				if (!playTest.active) {
					console.log('Play test stopped, closing Lua engine');

					lua.global.close();
					return;
				}

				if (waitSeconds > 0) {
					setTimeout(step, waitSeconds * 1000);
				} else {
					requestAnimationFrame(step);
				}
			}

			requestAnimationFrame(step);
		}

		initGameEngine();