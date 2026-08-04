import * as THREE from "three";
import * as ECS from "$lib/stores/ecs.svelte";

/**
 * Generates a base64 PNG preview thumbnail for any 3D Object
 * @param {THREE.Object3D} object - The loaded object mesh or group
 * @param {number} size - Resolution width/height of the thumbnail (e.g., 256)
 * @returns {string} Base64 PNG image string
 */
export async function generateObjectPreview(
    entities: ECS.Entity[],
    size = 256,
) {
    // 1. Create dedicated offscreen renderer
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();

    // 2. Add proper preview lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1.5, 1);
    scene.add(dirLight);

    // 3. Init entities
    const previewObject = new THREE.Group();
    for (const entity of entities) {
        const transformComponent = entity.components.find(
            (c) => c.name === "Transform",
        ) as ECS.Component | undefined;
        if (transformComponent) {
            const position = transformComponent.data.position.value as {
                x: number;
                y: number;
                z: number;
            };
            const rotation = transformComponent.data.rotation.value as {
                x: number;
                y: number;
                z: number;
            };
            const scale = transformComponent.data.scale.value as {
                x: number;
                y: number;
                z: number;
            };

            // uhh just do boxes for now
            // todo: support other geometry types

            let material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
            let geometry = new THREE.BoxGeometry(1, 1, 1);
            let mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(position.x, position.y, position.z);
            mesh.rotation.set(rotation.x, rotation.y, rotation.z);
            mesh.scale.set(scale.x, scale.y, scale.z);
            previewObject.add(mesh);
        }
    }
    scene.add(previewObject);

    // Calculate bounding box bounds
    const box = new THREE.Box3().setFromObject(previewObject);
    const center = new THREE.Vector3();
    const boxSize = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(boxSize);

    // Center the geometry pivot point inside our thumbnail scene
    previewObject.position.x += previewObject.position.x - center.x;
    previewObject.position.y += previewObject.position.y - center.y;
    previewObject.position.z += previewObject.position.z - center.z;

    // 4. Setup Camera with Automatic Framing Logic
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

    // Find the largest dimension of the object to size the camera view correctly
    const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);

    // Trigonometry calculation to fit the bounding sphere neatly in the camera's FOV angle
    const fovRad = (camera.fov * Math.PI) / 180;
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fovRad / 2)) + 2;

    // Multiply by a padding scale factor so object doesn't touch the edges tightly
    cameraZ *= 1.3;

    // Position the camera slightly higher and closer to get a standard 3/4 isometric game-icon angle
    camera.position.set(cameraZ * 0.5, cameraZ * 0.4, cameraZ);
    camera.lookAt(0, 0, 0);

    // 5. Force render and extract data immediately
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL("image/png");

    // 6. Clean up memory allocations to prevent GPU leaks
    renderer.dispose();
    scene.clear();

    return dataURL;
}
