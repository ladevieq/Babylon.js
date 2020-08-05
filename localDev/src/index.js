// const sceneFolder = "./assets/models/";
// const sceneFilename = "scene.glb";
// const sceneFolder = "./assets/models/kzp-scene/";
const sceneFolder = "./assets/models/result/";
const sceneFilename = "fileName.gltf";
let placeHolderMaterial = null;
let viewManagerInstance = null;

const debug = true;
if (debug) {
    window.spector = new SPECTOR.Spector();
    window.spector.spyCanvases();
    window.spector.displayUI();
}

const uvm = new BABYLON.UvMapper();
const quality = 3;
const qualitySettings = [
    {
        objectLightmapSize: {
            width: 64,
            height: 64,
        },
        lightLightmapSize: {
            width: 8,
            height: 8,
        },
    },
    {
        objectLightmapSize: {
            width: 128,
            height: 128,
        },
        lightLightmapSize: {
            width: 16,
            height: 16,
        },
    },
    {
        objectLightmapSize: {
            width: 256,
            height: 256,
        },
        lightLightmapSize: {
            width: 32,
            height: 32,
        },
    },
    {
        objectLightmapSize: {
            width: 512,
            height: 512,
        },
        lightLightmapSize: {
            width: 64,
            height: 64,
        },
    },
];

const prepareUvs = (meshes, scene) => {
    const meshesToProcess = meshes.filter((mesh) => (mesh.geometry && mesh.material && mesh.material.alpha === 1
        && mesh.name !== "earth"
        && mesh.name !== "skybox"
        && mesh.name !== "avatar"
        && mesh.name !== "ground"
    ));

    for (let i = 0; i < meshesToProcess.length; i++) {
        const mesh = meshesToProcess[i];
        const [uvWorldRatioX, uvWorldRationY] = uvm.map([mesh], 10, 66.0);

        if (!mesh.directInfo) {
            mesh.initForDirect(
                qualitySettings[quality].objectLightmapSize,
                scene
            );
        }
    }

    return meshesToProcess;
}

const addArealight = (position, normal, size, sampleCount, bias, normalBias, scene) => {
    return new BABYLON.Arealight(
        position,
        normal,
        {
            width: 60,
            height: 180,
        },
        {
            width: 2048,
            height: 2048,
        },
        {
            sampleCount,
            bias,
            normalBias,
        },
        scene,
    );
}

const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    viewManagerInstance = new ViewManager(engine);
    placeHolderMaterial = new BABYLON.StandardMaterial("place-holder", scene);
    placeHolderMaterial.ambientColor = new BABYLON.Color3(1.0, 1.0, 1.0);

    const camera = new BABYLON.FreeCamera("", new BABYLON.Vector3(0, 100, 0), scene);
    camera.speed = 10;
    camera.attachControl(engine.getRenderingCanvas(), true);

    const lights = [];
    // lights.push(addArealight(new BABYLON.Vector3(-150, 160, 135), new BABYLON.Vector3(1, 0, 0), 70, scene));
    lights.push(addArealight(new BABYLON.Vector3(10, 160, 200), new BABYLON.Vector3(0, 0, -1), 60, 16, 1e-5, 1e-9, scene));
    lights.push(addArealight(new BABYLON.Vector3(350, 120, 200), new BABYLON.Vector3(0, 0, -1), 80, 16, 1e-5, 1e-9, scene));

    BABYLON.SceneLoader.ImportMesh("", sceneFolder, sceneFilename, scene, (meshes) => {
        for (const mesh of meshes) {
            if (mesh.material) {
                mesh.material = mesh.material.clone(mesh.material.name);
            } else {
                mesh.material = placeHolderMaterial.clone();
            }
            mesh.material.backFaceCulling = false;
        }

        console.time("UV mapping");
        const meshesLightmapped = prepareUvs(meshes, scene);
        console.timeEnd("UV mapping");

        const near = 1;
        const far = 1500;
        const bias = 1e-5;
        const normalBias = 1e-9;

        console.log("Start shadow mapping");
        const pr = new BABYLON.DirectRenderer(scene, meshesLightmapped, lights, { near, far, bias, normalBias });

        for (const mesh of meshesLightmapped) {
            mesh.material.lightmapTexture = mesh.getShadowMap();
            mesh.material.useLightmapAsShadowmap = true;
            mesh.material.lightmapTexture.coordinatesIndex = 1;
        }

        const observer = scene.onAfterRenderObservable.add(() => {
            if (scene._frameId % 10 === 0) {
                pr.renderNextSample();

                if (!pr.isRenderFinished()) {
                    return;
                }

                console.log("Shadow mapping finished");
                scene.onAfterRenderObservable.remove(observer);
                // scene.ambientColor = new BABYLON.Color3(1, 1, 1);
            }
        });

        // const obs = scene.onBeforeRenderObservable.add(() => {
        //     window.spector.startCapture(scene.getEngine().getRenderingCanvas(), 10000, false);
        //     scene.onBeforeRenderObservable.remove(obs);
        // });
        // const ob = scene.onAfterRenderObservable.add(() => {
        //     window.spector.stopCapture();
        //     scene.onAfterRenderObservable.remove(ob);
        // });
    });

    // scene.getEngine().runRenderLoop(() => {
    //     console.log(scene);
    // });

    return scene;
}
