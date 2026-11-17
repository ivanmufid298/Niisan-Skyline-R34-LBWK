import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export async function start() {
  const canvas = document.querySelector('canvas');
  const stage = document.querySelector('.stage');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x464d52);
  const environment = await new EXRLoader().loadAsync(new URL('./studio.exr', import.meta.url).href);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(environment).texture;
  scene.environmentIntensity = 0.65;
  pmrem.dispose();
  environment.dispose();
  const key = new THREE.DirectionalLight(0xfff2db, 1.3);
  key.position.set(-3, 6, 4);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  let model;
  try {
    model = await loader.loadAsync(new URL('./skyline-r34.glb', import.meta.url).href);
  } finally {
    draco.dispose();
  }
  model.scene.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.map) material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
  });
  scene.add(model.scene);
  const bounds = new THREE.Box3().setFromObject(model.scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.length())) throw new Error('Invalid model bounds');

  const shadow = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
      shadow.image.data[(y * 64 + x) * 4 + 3] = Math.round(165 * Math.max(0, 1 - radius) ** 1.4);
    }
  }
  shadow.needsUpdate = true;
  shadow.magFilter = THREE.LinearFilter;
  const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 2.15, size.z * 1.65),
    new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false }));
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.set(center.x, bounds.min.y - 0.003, center.z);
  scene.add(groundShadow);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x434a50, roughness: 0.65, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = bounds.min.y - 0.005;
  scene.add(floor);

  const radius = size.length() / 2;
  function frameModel() {
    const fov = THREE.MathUtils.degToRad(camera.fov / 2);
    const fit = radius / Math.sin(Math.min(fov, Math.atan(Math.tan(fov) * camera.aspect)));
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.42, 1.35).normalize(), fit * 1.04);
    controls.minDistance = radius * 0.85;
    controls.maxDistance = fit * 2.5;
    camera.far = controls.maxDistance * 3;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    const aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    if (Math.abs(camera.aspect - aspect) > 0.12) {
      camera.aspect = aspect;
      frameModel();
    } else {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }
  resize();
  frameModel();
  new ResizeObserver(resize).observe(stage);
  renderer.setAnimationLoop(() => {
    if (document.hidden) return;
    controls.update();
    renderer.render(scene, camera);
  });
}
