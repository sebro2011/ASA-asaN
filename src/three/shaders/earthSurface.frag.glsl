// Photorealistic orbital Earth surface shader derived strictly from bundled
// NASA Blue Marble (day), Black Marble (night), and global cloud textures.
// Composed with `common.glsl` (provides cosmoraSaturate, cosmoraFresnel, cosmoraTerminator).

uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec3 uSunDirection;
uniform float uCloudOffsetU;
uniform float uCloudShadowStrength;
uniform float uReliefStrength;
uniform float uOceanSpecularStrength;

varying vec2 vUv;
varying vec3 vNormalWorld;
varying vec3 vPositionWorld;

// Subtle filmic highlight rolloff so intense ocean sunglint stays smooth.
vec3 cosmoraFilmicSoft(vec3 x) {
  return x / (vec3(1.0) + x * 0.28);
}

// Estimate open-ocean surface probability directly from NASA Blue Marble RGB
// chrominance (deep ocean water has strong blue dominance over red & green,
// while excluding bright polar ice caps and arid landmasses).
float estimateOceanMask(vec3 albedo) {
  float luma = dot(albedo, vec3(0.299, 0.587, 0.114));
  float blueExcess = albedo.b - max(albedo.r * 1.18, albedo.g * 0.96);
  float waterTone = smoothstep(0.015, 0.14, blueExcess);
  float notPolarIce = 1.0 - smoothstep(0.46, 0.72, luma);
  return cosmoraSaturate(waterTone * notPolarIce);
}

void main() {
  vec3 normal = normalize(vNormalWorld);
  vec3 viewDir = normalize(cameraPosition - vPositionWorld);
  vec3 sunDir = normalize(uSunDirection);

  vec3 dayTex = texture2D(uDay, vUv).rgb;
  vec3 nightTex = texture2D(uNight, vUv).rgb;

  float sunDot = dot(normal, sunDir);
  float dayMix = cosmoraTerminator(normal, sunDir, -0.16, 0.30);

  // Subtle continental micro-relief using WebGL1/2-safe 2-tap luminance slope.
  float reliefShade = 1.0;
  float oceanMask = estimateOceanMask(dayTex);
  if (uReliefStrength > 0.001) {
    vec2 texel = vec2(0.0009, 0.0018);
    float hC = dot(dayTex, vec3(0.299, 0.587, 0.114));
    float hU = dot(texture2D(uDay, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float hV = dot(texture2D(uDay, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float slope = clamp(((hU - hC) - (hV - hC)) * 4.5, -0.5, 0.5);
    float landMask = 1.0 - oceanMask;
    reliefShade = 1.0 + slope * uReliefStrength * landMask * dayMix;
  }

  // Physically-plausible Lambertian + limb-softened day illumination.
  float diffuse = smoothstep(-0.14, 0.92, sunDot);
  vec3 dayLit = dayTex * (0.14 + 0.98 * diffuse) * reliefShade;

  // Cloud-cast shadow projected gently onto the sunlit surface.
  float cloudCover = 0.0;
  if (uCloudShadowStrength > 0.001 && dayMix > 0.01) {
    vec2 shadowUv = vec2(fract(vUv.x + uCloudOffsetU - 0.0028), clamp(vUv.y - 0.0016, 0.0, 1.0));
    cloudCover = texture2D(uClouds, shadowUv).a;
    dayLit *= 1.0 - cloudCover * uCloudShadowStrength * dayMix;
  }

  // Solar sunglint across open oceans (broad atmospheric glint + sharp specular core).
  vec3 halfVec = normalize(sunDir + viewDir);
  float specBase = max(dot(normal, halfVec), 0.0);
  float specCore = pow(specBase, 52.0);
  float specBroad = pow(specBase, 12.0);
  float cloudAtten = 1.0 - cloudCover * 0.78;
  float glintWeight = oceanMask * dayMix * cloudAtten * uOceanSpecularStrength;
  vec3 oceanGlint = (vec3(1.0, 0.95, 0.86) * specCore * 0.72 + vec3(0.56, 0.82, 1.0) * specBroad * 0.22) * glintWeight;

  // Warm Rayleigh sunset/sunrise scattering band hugging the solar terminator.
  float twilightBand = exp(-pow((sunDot - 0.03) * 6.2, 2.0));
  float limbBoost = 0.45 + 0.55 * cosmoraFresnel(normal, viewDir, 1.8);
  vec3 twilightTint = vec3(0.95, 0.42, 0.16) * twilightBand * limbBoost * 0.22;

  // NASA Black Marble night side: warm sodium-amber urban glow + subtle orbital dark floor.
  vec3 cityLights = pow(max(nightTex, vec3(0.0)), vec3(1.18)) * vec3(1.38, 1.06, 0.68);
  float nightFade = 1.0 - smoothstep(-0.18, 0.16, sunDot);
  vec3 darkAmbient = dayTex * vec3(0.025, 0.045, 0.085);
  vec3 nightColor = darkAmbient + cityLights * nightFade * 1.05;

  // Inner Rayleigh atmospheric veil strongest toward the sunlit horizon limb.
  float fresnel = cosmoraFresnel(normal, viewDir, 2.75);
  vec3 dayAtmo = vec3(0.24, 0.62, 0.98) * fresnel * (0.16 + 0.96 * dayMix);
  vec3 nightAtmo = vec3(0.07, 0.16, 0.34) * fresnel * (1.0 - dayMix) * 0.45;

  vec3 surface = mix(nightColor, dayLit, dayMix) + oceanGlint + twilightTint + dayAtmo + nightAtmo;
  gl_FragColor = vec4(cosmoraFilmicSoft(surface), 1.0);
}
