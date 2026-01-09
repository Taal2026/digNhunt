
console.log("✅ game.js loaded");

// ===== IMPORTS =====
import * as THREE from "three";
import { PointerLockControls } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js";

// ===== GLOBALS =====

let scene, camera, renderer, controls;
let keyObject = null;
let hasKey = false;

// ===== HOUSE POSITION TRACKING =====
const houseCenters = [
  { x: 0, z: 0 },        // first room
  { x: 16, z: 0 },       // second room
  { x: -18, z: 18 }      // third house
];

// ===== RANDOM HOUSE POSITION HELPER =====
function getRandomHousePosition(minDist = 18) {
  let x, z, safe;

  do {
    safe = true;

    x = THREE.MathUtils.randFloat(-40, 40);
    z = THREE.MathUtils.randFloat(-40, 40);

    for (const h of houseCenters) {
      const dist = Math.hypot(x - h.x, z - h.z);
      if (dist < minDist) {
        safe = false;
        break;
      }
    }

  } while (!safe);

  houseCenters.push({ x, z });
  return { x, z };
}


function showWinScreen() {
  controls.unlock();           // exit mouse lock
  document.getElementById("winScreen").style.display = "flex";
}


// ===== COLLISION =====
const collidableObjects = [];
const raycaster = new THREE.Raycaster();
const collisionDistance = 0.4;

// ===== SEARCH =====
const searchableObjects = [];
let treasureObject = null;
let canSearch = false;
let currentTarget = null;

// ===== MOVEMENT =====
let moveForward = false,
  moveBackward = false,
  moveLeft = false,
  moveRight = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const speed = 6;

// ===== START =====
init();

animate();


function createThirdHouse() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xb5d9f2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b3a3a });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x99ccff,
    transparent: true,
    opacity: 0.6
  });

  const cx = -18;   // position of new house
  const cz = 18;
  const w = 10, d = 10, h = 3, t = 0.25;
  const doorWidth = 2.5;

  // Walls
  addWall(w, h, t, cx, h/2, cz-d/2, mat); // back
  addWall((w-doorWidth)/2, h, t, cx-(doorWidth/2+(w-doorWidth)/4), h/2, cz+d/2, mat);
  addWall((w-doorWidth)/2, h, t, cx+(doorWidth/2+(w-doorWidth)/4), h/2, cz+d/2, mat);
  addWall(doorWidth, 0.4, t, cx, h-0.2, cz+d/2, mat); // door top
  addWall(t, h, d, cx-w/2, h/2, cz, mat);
  addWall(t, h, d, cx+w/2, h/2, cz, mat);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10,10),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.set(cx,0.01,cz);
  scene.add(floor);
  collidableObjects.push(floor);

  // 🔺 TRIANGLE ROOF
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(7.5, 3, 4),
    roofMat
  );
  roof.position.set(cx, h + 1.5, cz);
  roof.rotation.y = Math.PI / 4;
  scene.add(roof);

  // 🪟 SMALL WINDOW
  const window = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1),
    windowMat
  );
  window.position.set(cx - 3, h / 2 + 0.3, cz - d / 2 + 0.15);
  scene.add(window);

  // Furniture (searchable)
  loadModel("assets/models/loungeSofa.glb", { x: cx-1, y:0, z:cz }, 1, Math.PI);
  loadModel("assets/models/tableCoffee.glb", { x: cx, y:0, z:cz-1.5 }, 1, 0);
  loadModel("assets/models/plantSmall3.glb", { x: cx+3, y:0, z:cz+3 }, 1, 0);
}

// ===== INIT =====
function init() {
  // 🌤 Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe9ff);

  // 📷 Camera (more grounded view)
  camera = new THREE.PerspectiveCamera(
    65,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );

  // 🖥 Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

  // ☀ Light
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbaaaa, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(10, 15, 5);
  scene.add(sun);

  // 🌍 LARGE OUTSIDE GROUND (supports random houses)
const groundSize = 200;

const outsideGround = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0x8b6b4a })
);

outsideGround.rotation.x = -Math.PI / 2;
outsideGround.position.y = 0;
scene.add(outsideGround);
collidableObjects.push(outsideGround);


  // 🏠 Inside floor
  const houseFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
  );
  houseFloor.rotation.x = -Math.PI / 2;
  houseFloor.position.y = 0.01;
  scene.add(houseFloor);
  collidableObjects.push(houseFloor);

  // 🎮 Controls
  controls = new PointerLockControls(camera, document.body);
  document.body.addEventListener("click", () => controls.lock());
  scene.add(controls.getObject());
  controls.getObject().position.set(0, 1.6, 30);
  controls.getObject().lookAt(0, 1.6, 0);
  scene.add(controls.getObject());

// 🚶 Player spawn (OUTSIDE the houses)
controls.getObject().position.set(0, 1.6, 30);
controls.getObject().lookAt(0, 1.6, 0);


  // 🧱 House
  createRoom();


  // 🌳 Trees
  createTrees();
  
createSecondRoom();
createThirdHouse();

// 🏠 GREENISH STUDY ROOM
createRoomAt(32, 0, 0xc1f2d1);

// 🧑‍💻 Add study / office items
addStudyRoomItems(32, 0);
// 🏠 RANDOM PURPLE ROOM
const purplePos = getRandomHousePosition();
createRoomAt(purplePos.x, purplePos.z, 0xd1c1f2);
addBathroomItems(purplePos.x, purplePos.z);

// 🏠 RANDOM YELLOW ROOM (BEDROOM / STORAGE)
const yellowPos = getRandomHousePosition();
createRoomAt(yellowPos.x, yellowPos.z, 0xf2e2b5);
// 🏆 TREASURE INSIDE YELLOW HOUSE
loadModel(
  "assets/models/tableCoffee.glb",
  {
    x: yellowPos.x + 1.2,   // slight offset inside room
    y: 0,
    z: yellowPos.z - 1.0
  },
  1,
  0,
  "TREASURE"
);


// 🛏 Add bedroom & storage items
addBedroomStorageItems(yellowPos.x, yellowPos.z);



  // 🛋 Furniture (ALL searchable)
  loadModel("assets/models/bedSingle.glb", { x: -2, y: 0, z: -3 }, 1, Math.PI / 2);
  loadModel("assets/models/bathroomCabinet.glb", { x: 0, y: 0, z: 3 }, 1, Math.PI);
loadModel(
  "assets/models/chair.glb",
  { x: 2, y: 0, z: -1 },
  1,
  0,
  "KEY"
);
  loadModel("assets/models/loungeSofa.glb", { x: -1, y: 0, z: 1 }, 1, Math.PI);
  loadModel("assets/models/tableCoffee.glb", { x: -1, y: 0, z: 0 }, 1, 0);
  loadModel("assets/models/rugRectangle.glb", { x: -1, y: 0.01, z: 0 }, 1, 0);
  loadModel("assets/models/plantSmall1.glb", { x: 3, y: 0, z: 3 }, 1, 0);

  // 🔑 Pick key & treasure
 // Furniture inside Room 3
loadModel(
  "assets/models/loungeChair.glb",
  { x: 32 + 2, y: 0, z: -2 },
  1,
  0
);


  window.addEventListener("resize", onResize);

  setTimeout(assignFixedObjects, 1000);

} // ✅ init CLOSED correctly

// ===== ROOM =====
function createRoom() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2b5b5 });
  const w = 10,
    d = 10,
    h = 3,
    t = 0.25;
  const doorWidth = 2.5;

  addWall(w, h, t, 0, h / 2, -d / 2, mat); // back
  addWall(
    (w - doorWidth) / 2,
    h,
    t,
    -(doorWidth / 2 + (w - doorWidth) / 4),
    h / 2,
    d / 2,
    mat
  );
  addWall(
    (w - doorWidth) / 2,
    h,
    t,
    doorWidth / 2 + (w - doorWidth) / 4,
    h / 2,
    d / 2,
    mat
  );
  addWall(doorWidth, 0.4, t, 0, h - 0.2, d / 2, mat); // door top
  addWall(t, h, d, -w / 2, h / 2, 0, mat);
  addWall(t, h, d, w / 2, h / 2, 0, mat);
}

function createSecondRoom() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2c1c1 });
  const w = 10, d = 10, h = 3, t = 0.25;
  const doorWidth = 2.5;
  const offsetX = 16; // 👈 distance from first house

  // Back wall
  addWall(w, h, t, offsetX, h / 2, -d / 2, mat);

  // Front wall (LEFT of door)
  addWall(
    (w - doorWidth) / 2,
    h,
    t,
    offsetX - (doorWidth / 2 + (w - doorWidth) / 4),
    h / 2,
    d / 2,
    mat
  );

  // Front wall (RIGHT of door)
  addWall(
    (w - doorWidth) / 2,
    h,
    t,
    offsetX + (doorWidth / 2 + (w - doorWidth) / 4),
    h / 2,
    d / 2,
    mat
  );


  // Door top
  addWall(doorWidth, 0.4, t, offsetX, h - 0.2, d / 2, mat);

  // Left wall
  addWall(t, h, d, offsetX - w / 2, h / 2, 0, mat);

  // Right wall
  addWall(t, h, d, offsetX + w / 2, h / 2, 0, mat);

  // ---- INSIDE FLOOR ----
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(offsetX, 0.01, 0);
  scene.add(floor);
  collidableObjects.push(floor);

  // ---- FURNITURE ----
  loadModel("assets/models/loungeSofa.glb", { x: offsetX - 1, y: 0, z: 1 }, 1, Math.PI);
  loadModel("assets/models/loungeChair.glb", { x: offsetX + 2, y: 0, z: -1 }, 1, 0);

  loadModel("assets/models/rugRectangle.glb", { x: offsetX, y: 0.01, z: 0 }, 1, 0);
  loadModel("assets/models/plantSmall2.glb", { x: offsetX + 3, y: 0, z: 3 }, 1, 0);
}



function createRoomAt(cx, cz, wallColor = 0xf2b5b5) {
  const mat = new THREE.MeshStandardMaterial({ color: wallColor });
  const w = 10, d = 10, h = 3, t = 0.25;
  const doorWidth = 2.5;

  // Back wall
  addWall(w, h, t, cx, h / 2, cz - d / 2, mat);

  // Front wall (door opening)
  addWall((w - doorWidth) / 2, h, t, cx - (doorWidth / 2 + (w - doorWidth) / 4), h / 2, cz + d / 2, mat);
  addWall((w - doorWidth) / 2, h, t, cx + (doorWidth / 2 + (w - doorWidth) / 4), h / 2, cz + d / 2, mat);

  // Door top
  addWall(doorWidth, 0.4, t, cx, h - 0.2, cz + d / 2, mat);

  // Side walls
  addWall(t, h, d, cx - w / 2, h / 2, cz, mat);
  addWall(t, h, d, cx + w / 2, h / 2, cz, mat);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.01, cz);
  scene.add(floor);
  collidableObjects.push(floor);
}


function addWall(w, h, d, x, y, z, mat) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  wall.position.set(x, y, z);
  scene.add(wall);
  collidableObjects.push(wall);
}

// 🌳 Trees (never inside house)
function createTrees() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3b1e });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3c7a3c });

  for (let i = 0; i < 8; i++) {
    let x, z;
    do {
      x = THREE.MathUtils.randFloat(-35, 35);
      z = THREE.MathUtils.randFloat(-35, 35);
    } while (Math.abs(x) < 8 && Math.abs(z) < 8);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, 2),
      trunkMat
    );
    trunk.position.set(x, 1, z);

    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 16, 16),
      leafMat
    );
    leaves.position.set(x, 3, z);

    scene.add(trunk);
    scene.add(leaves);
  }
}

// ===== LOAD MODEL =====
function loadModel(path, position, scale, rotationY, tag = null) {
  new GLTFLoader().load(path, (gltf) => {
    const model = gltf.scene;

    model.position.set(position.x, position.y, position.z);
    model.scale.set(scale, scale, scale);
    model.rotation.y = rotationY;

    // 🔖 attach tag (KEY / TREASURE / null)
    model.userData.tag = tag;

    scene.add(model);
    searchableObjects.push(model);
  });
}

function addStudyRoomItems(cx, cz) {

  // =========================
  // 🧑‍💻 DESK AREA (RIGHT WALL)
  // =========================

  // Desk
  loadModel(
    "assets/models/desk.glb",
    { x: cx + 3.2, y: 0, z: cz },
    1,
    -Math.PI / 2
  );

  // Computer screen (ON desk)
  loadModel(
    "assets/models/computerScreen.glb",
    { x: cx + 3.05, y: 0.85, z: cz },
    1,
    -Math.PI / 2
  );

  // Keyboard (ON desk)
  loadModel(
    "assets/models/computerKeyboard.glb",
    { x: cx + 2.9, y: 0.82, z: cz + 0.15 },
    1,
    -Math.PI / 2
  );

  // Mouse (ON desk)
  loadModel(
    "assets/models/computerMouse.glb",
    { x: cx + 2.85, y: 0.82, z: cz - 0.15 },
    1,
    -Math.PI / 2
  );

  // Table lamp (ON desk corner)
  loadModel(
    "assets/models/lampRoundTable.glb",
    { x: cx + 3.0, y: 0.85, z: cz - 0.6 },
    1,
    0
  );

  // Desk chair (pulled back slightly)
  loadModel(
    "assets/models/chairDesk.glb",
    { x: cx + 2.3, y: 0, z: cz },
    1,
    Math.PI
  );

  // =========================
  // 🪑 CHAIRS (LEFT WALL – NO COUCH COLLISION)
  // =========================

  loadModel(
    "assets/models/chair.glb",
    { x: cx - 3, y: 0, z: cz - 1.5 },
    1,
    Math.PI / 2
  );

  loadModel(
    "assets/models/chairCushion.glb",
    { x: cx - 3, y: 0, z: cz },
    1,
    Math.PI / 2
  );

  loadModel(
    "assets/models/chairRounded.glb",
    { x: cx - 3, y: 0, z: cz + 1.5 },
    1,
    Math.PI / 2
  );

  // =========================
  // 🧥 COAT RACKS (BACK WALL)
  // =========================

  loadModel(
    "assets/models/coatRack.glb",
    { x: cx - 1.5, y: 0, z: cz + 3 },
    1,
    0
  );

  loadModel(
    "assets/models/coatRackStanding.glb",
    { x: cx + 1.5, y: 0, z: cz + 3 },
    1,
    0
  );
}



function addBedroomStorageItems(cx, cz) {

  // 📚 Bookcase + books (left wall)
  loadModel(
    "assets/models/bookcaseOpenLow.glb",
    { x: cx - 3, y: 0, z: cz - 2 },
    1,
    Math.PI / 2
  );

  loadModel(
    "assets/models/books.glb",
    { x: cx - 3, y: 1.1, z: cz - 2 },
    1,
    Math.PI / 2
  );

  // 🛏 Bed cabinet zone (back wall)
  loadModel(
    "assets/models/cabinetBed.glb",
    { x: cx, y: 0, z: cz + 3 },
    1,
    Math.PI
  );

  loadModel(
    "assets/models/cabinetBedDrawer.glb",
    { x: cx + 1.2, y: 0, z: cz + 3 },
    1,
    Math.PI
  );

  loadModel(
    "assets/models/cabinetBedDrawerTable.glb",
    { x: cx - 1.2, y: 0, z: cz + 3 },
    1,
    Math.PI
  );

  // 📺 TV cabinet (right wall)
  loadModel(
    "assets/models/cabinetTelevision.glb",
    { x: cx + 3, y: 0, z: cz - 1 },
    1,
    -Math.PI / 2
  );

  loadModel(
    "assets/models/cabinetTelevisionDoors.glb",
    { x: cx + 3, y: 0, z: cz + 1 },
    1,
    -Math.PI / 2
  );

  // 📦 Storage boxes (corner)
  loadModel(
    "assets/models/cardboardBoxClosed.glb",
    { x: cx - 2.5, y: 0, z: cz + 2 },
    1,
    0
  );

  loadModel(
    "assets/models/cardboardBoxOpen.glb",
    { x: cx - 1.5, y: 0, z: cz + 2 },
    1,
    0
  );
}

function addBathroomItems(cx, cz) {
  // Sink area (one wall)
  loadModel(
    "assets/models/bathroomSink.glb",
    { x: cx - 3, y: 0, z: cz - 2 },
    1,
    Math.PI / 2
  );

  loadModel(
    "assets/models/bathroomMirror.glb",
    { x: cx - 3, y: 1.6, z: cz - 2.05 },
    1,
    Math.PI / 2
  );

  // Cabinet & drawer
  loadModel(
    "assets/models/bathroomCabinet.glb",
    { x: cx - 3, y: 0, z: cz + 1 },
    1,
    Math.PI / 2
  );

  loadModel(
    "assets/models/bathroomCabinetDrawer.glb",
    { x: cx - 2, y: 0, z: cz + 1 },
    1,
    Math.PI / 2
  );

  // Bathtub (back wall)
  loadModel(
    "assets/models/bathtub.glb",
    { x: cx + 3, y: 0, z: cz },
    1,
    -Math.PI / 2
  );

  // Extra sink (optional)
  loadModel(
    "assets/models/bathroomSinkSquare.glb",
    { x: cx, y: 0, z: cz - 3 },
    1,
    Math.PI
  );
}


// ===== INPUT =====
document.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") moveForward = true;
  if (e.code === "KeyS") moveBackward = true;
  if (e.code === "KeyA") moveLeft = true;
  if (e.code === "KeyD") moveRight = true;

  if (e.code === "KeyE" && canSearch && currentTarget) {
    if (currentTarget === keyObject && !hasKey) {
      hasKey = true;
      alert("🔑 You found the KEY!");
    } else if (currentTarget === treasureObject) {
  if (hasKey) {
    showWinScreen(); // 🏆 WIN!
  } else {
    alert("🔒 Treasure locked. Find the key!");
  }
}
 else {
      alert("❌ Nothing here...");
    }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") moveForward = false;
  if (e.code === "KeyS") moveBackward = false;
  if (e.code === "KeyA") moveLeft = false;
  if (e.code === "KeyD") moveRight = false;
});

// ===== ANIMATE =====
function animate() {
    console.log("🎮 rendering frame");

  requestAnimationFrame(animate);

  if (controls.isLocked) {
    direction
      .set(
        Number(moveRight) - Number(moveLeft),
        0,
        Number(moveForward) - Number(moveBackward)
      )
      .normalize();

    velocity.copy(direction).multiplyScalar(speed * 0.016);
    const prev = controls.getObject().position.clone();

    controls.moveRight(velocity.x);
    controls.moveForward(velocity.z);

    raycaster.set(prev, controls.getObject().position.clone().sub(prev).normalize());
    const hits = raycaster.intersectObjects(collidableObjects);
    if (hits.length && hits[0].distance < collisionDistance) {
      controls.getObject().position.copy(prev);
    }
  }

  // 🔍 Proximity search (ACCURATE & STABLE)
canSearch = false;
currentTarget = null;
const playerPos = controls.getObject().position;

for (const obj of searchableObjects) {
  const box = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const distance = playerPos.distanceTo(center);

  if (distance < 1.8) {   // 👈 REALISTIC distance
    canSearch = true;
    currentTarget = obj;

    document.getElementById("searchText").style.display = "block";
    break;
  }
}

if (!canSearch) {
  document.getElementById("searchText").style.display = "none";
}

renderer.render(scene, camera);


}

// ===== RESIZE =====
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function assignFixedObjects() {
  for (const obj of searchableObjects) {
    if (obj.userData.tag === "KEY") {
      keyObject = obj;
    }
    if (obj.userData.tag === "TREASURE") {
      treasureObject = obj;
    }
  }

  console.log("🔑 Key:", keyObject);
  console.log("🏆 Treasure:", treasureObject);
}
