// 구운 자세로 여럿을 **한 번에** 그린다.
//
// 사람마다 스킨 메시를 두면 드로우콜이 사람 수만큼이다. 재 보니 그것이
// 벽의 절반이었다 — 800명×뼈11(드로우콜 801)이 200명×뼈65(드로우콜 201)와
// 거의 같은 값이었다 (lib/crowdBudget.mjs 의 BROWSER_MEASURED).
//
// 여기서는 InstancedMesh 하나에 모두를 담고, 스키닝을 셰이더가 한다. 뼈
// 행렬은 미리 구워 둔 텍스처에서 읽는다 (lib/poseBake.mjs).
//
// **대가가 있다.** 구운 클립만 틀 수 있고, 섞어 넘기기(cross-fade)가 없고,
// 사람마다 다른 리그를 못 쓴다. 그래서 가까운 사람에게는 안 쓴다 — 이것은
// 먼 단계의 수단이다.
//
// three 는 여기서도 **주입받는다.**

import { textureSize, rowAt } from '../lib/poseBake.mjs';

const VERT = /* glsl */`
  attribute vec4 skinIndex;
  attribute vec4 skinWeight;
  attribute float aRow;      // 이 사람이 지금 볼 아틀라스 줄 (소수)
  #ifdef USE_BAKED_COLOR
  attribute vec3 color;      // 텍스처를 구워 넣은 정점 색 (lib/vertexColor.mjs)
  varying vec3 vColor;
  #endif
  uniform sampler2D poseTex;
  uniform vec2 poseSize;     // (가로 텍셀, 세로 텍셀)
  varying vec3 vNormal;

  // 뼈 하나의 행렬 = 가로로 이어진 텍셀 넷.
  mat4 boneAt(float row, float bone) {
    float x = bone * 4.0;
    // 텍셀 **가운데**를 찍는다. 가장자리를 찍으면 이웃 뼈의 값이 섞여
    // 들어와 팔이 몸통을 따라간다 — 이 부류의 버그는 화면에서 "가끔
    // 뒤틀린다" 로만 보인다.
    float v = (row + 0.5) / poseSize.y;
    vec4 c0 = texture2D(poseTex, vec2((x + 0.5) / poseSize.x, v));
    vec4 c1 = texture2D(poseTex, vec2((x + 1.5) / poseSize.x, v));
    vec4 c2 = texture2D(poseTex, vec2((x + 2.5) / poseSize.x, v));
    vec4 c3 = texture2D(poseTex, vec2((x + 3.5) / poseSize.x, v));
    return mat4(c0, c1, c2, c3);
  }

  void main() {
    // 프레임 사이를 섞는다. 안 섞으면 30fps 로 구운 것이 30fps 로 보인다.
    float r0 = floor(aRow);
    float f = aRow - r0;
    mat4 skin = mat4(0.0);
    for (int i = 0; i < 4; i++) {
      float w = skinWeight[i];
      if (w <= 0.0) continue;
      float b = skinIndex[i];
      mat4 m0 = boneAt(r0, b);
      mat4 m1 = boneAt(r0 + 1.0, b);
      // 행렬을 그대로 섞는다. 사원수로 섞는 것보다 거칠지만, 30fps 사이의
      // 30분의 1초에서는 눈에 안 띈다 — 그리고 셰이더가 훨씬 싸다.
      skin += w * (m0 * (1.0 - f) + m1 * f);
    }
    vec4 skinned = skin * vec4(position, 1.0);
    vNormal = normalize(mat3(instanceMatrix) * mat3(skin) * normal);
    #ifdef USE_BAKED_COLOR
    vColor = color;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * skinned;
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  varying vec3 vNormal;
  #ifdef USE_BAKED_COLOR
  varying vec3 vColor;
  #endif
  uniform vec3 uColor;
  void main() {
    // 반구광 하나. 재료를 흉내 내지 않는다 — 이 단계의 사람은 멀리 있고,
    // 여기서 재는 것은 **비용**이지 그림이 아니다.
    float d = clamp(dot(normalize(vNormal), normalize(vec3(0.4, 1.0, 0.3))), 0.0, 1.0);
    #ifdef USE_BAKED_COLOR
    // 구워 온 색이 있으면 그것으로 칠한다. uColor 는 그 위에 곱하는 물이라,
    // 안 준 팩에서만 색 노릇을 한다 (기본 흰색).
    vec3 base = vColor * uColor;
    #else
    vec3 base = uColor;
    #endif
    gl_FragColor = vec4(base * (0.35 + 0.65 * d), 1.0);
  }
`;

/**
 * 구운 아틀라스로 군중 하나.
 *
 * @param THREE     three 모듈 (주입)
 * @param geometry  스킨 메시의 기하 (position·normal·skinIndex·skinWeight)
 * @param atlas     lib/poseBake.mjs 의 bakeAtlas 결과
 * @param count     사람 수
 */
export function createInstancedCrowd({ THREE, geometry, atlas, count, color }) {
  if (!THREE?.InstancedMesh) throw new Error('THREE 를 주입해야 한다');
  if (!atlas?.data) throw new Error('구운 아틀라스가 필요하다');
  if (!geometry.getAttribute('skinIndex') || !geometry.getAttribute('skinWeight')) {
    throw new Error('스킨 정보가 없는 기하로는 못 그린다');
  }

  const width = atlas.bones * 4;
  const tex = new THREE.DataTexture(atlas.data, width, atlas.height, THREE.RGBAFormat, THREE.FloatType);
  // **보간을 끈다.** 텍스처가 값을 섞으면 행렬이 섞여서, 우리가 셰이더에서
  // 하는 섞기와 두 번 섞인다. 줄 사이 섞기는 셰이더가 명시적으로 한다.
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  // **색을 구워 온 살인가.** 정점 색이 있으면 그것으로 칠하고, 없으면 예전처럼
  // 한 색으로 칠한다 (기본 회색). 셰이더를 둘로 두지 않고 #define 으로 가른다 —
  // 재료가 둘이 되면 배치가 갈라지고, 드로우콜을 하나로 줄인 뜻이 없어진다.
  const baked = !!geometry.getAttribute('color');
  const material = new THREE.ShaderMaterial({
    defines: baked ? { USE_BAKED_COLOR: '' } : {},
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      poseTex: { value: tex },
      poseSize: { value: new THREE.Vector2(width, atlas.height) },
      uColor: { value: new THREE.Color(color ?? (baked ? 0xffffff : 0xb8bec6)) },
    },
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;   // 격자로 세우면 경계상자가 원점에 붙는다

  const rows = new Float32Array(count);
  geometry.setAttribute('aRow', new THREE.InstancedBufferAttribute(rows, 1));

  const state = new Array(count).fill(null).map(() => ({ clip: atlas.clips[0], timeS: 0, speed: 1 }));
  const dummy = new THREE.Object3D();

  /** 사람 하나를 놓는다. */
  function place(i, { position = [0, 0, 0], headingRad = 0, clipId, timeOffsetS = 0, timeScale = 1 }) {
    dummy.position.set(position[0], position[1], position[2]);
    // 리그의 앞을 뺀다 — 재생기(clipPlayer)와 같은 셈이라야 가까운 사람과
    // 먼 사람이 같은 쪽을 본다. 못 잰 팩은 null 이고, 그때는 안 건드린다.
    dummy.rotation.set(0, typeof atlas.forwardRad === 'number' ? headingRad - atlas.forwardRad : headingRad, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    const clip = atlas.clips.find((c) => c.id === clipId) || atlas.clips[0];
    state[i] = { clip, timeS: timeOffsetS, speed: timeScale };
  }

  /**
   * 자리만 옮긴다 — 재생 시각은 건드리지 않는다.
   *
   * 경로를 따라 걷게 하는 쪽이 프레임마다 부른다. 같은 일을 `place` 로 하면
   * **매 프레임 재생 시각이 0 으로 돌아가서** 사람이 첫 자세로 굳는다
   * (걷는 다리가 한 지점에서 떨린다).
   */
  function moveTo(i, { position, headingRad }) {
    mesh.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    if (position) dummy.position.set(position[0], position[1] || 0, position[2]);
    if (typeof headingRad === 'number') {
      dummy.rotation.set(0, typeof atlas.forwardRad === 'number' ? headingRad - atlas.forwardRad : headingRad, 0);
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 이 사람의 재생 속도만 바꾼다 — 재생 시각도 자리도 안 건드린다.
   *
   * 경로에서 앞이 막혀 늦춰질 때 쓴다. 땅 위를 가는 속도와 재생 속도가
   * 따로 놀면 발이 미끄러지고, 아주 막혔는데 다리만 움직이면 **제자리에서
   * 걷는 사람**이 된다 — 멀리서도 그건 눈에 띈다.
   */
  function setSpeed(i, timeScale) {
    state[i].speed = timeScale;
  }

  /** 시간을 흘린다. */
  function update(dtS) {
    for (let i = 0; i < count; i++) {
      const s = state[i];
      s.timeS += dtS * s.speed;
      rows[i] = rowAt(s.clip, s.timeS);
    }
    geometry.getAttribute('aRow').needsUpdate = true;
  }

  /** 이 사람이 지금 보고 있는 줄 — 게이트가 셰이더와 같은 셈인지 볼 때 쓴다. */
  function rowOf(i) {
    return rows[i];
  }

  function dispose() {
    tex.dispose();
    material.dispose();
    mesh.dispose();
  }

  return {
    mesh,
    place,
    moveTo,
    setSpeed,
    update,
    rowOf,
    dispose,
    // **드로우콜 수** — 섞어 세우기(createMixedCrowd)는 이 값을 내는데 여기는
    // 안 냈다. 소비처 시험(scripts/smoke-consumer.mjs)이 `undefined` 를 찍어
    // 드러났다. 이 층의 존재 이유가 드로우콜을 줄인 것이므로, 그 수를 쓰는
    // 쪽이 물을 수 있어야 한다. 한 몸 = 메시 하나 = 드로우콜 하나다.
    drawCalls: 1,
    textureSize: textureSize({ bones: atlas.bones, frames: atlas.height }),
  };
}
