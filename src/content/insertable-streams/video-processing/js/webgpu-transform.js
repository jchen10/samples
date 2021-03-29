/*
 *  Copyright (c) 2021 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

/**
 * Applies a warp effect using WebGPU.
 * @implements {FrameTransform} in pipeline.js
 */
class WebGPUTransform { // eslint-disable-line no-unused-vars
  constructor() {
    // All fields are initialized in init()
    /** @private {string} */
    this.debugPath_ = 'debug.pipeline.frameTransform_';

    this.canvas_ = null;
    this.device_ = null;
    this.swapChain_ = null;
    this.swapChainFormat_ = "bgra8unorm";
    this.sampler_ = null;
    this.verticeBuffer_ = null;

    this.videoWidth_ = null;
    this.videoHeight_ = null;
    this.videoFormat_ = null;
    this.vertextShaderSource_ = null;
    this.fragmentShaderSource_ = null;
    this.pipeline_ = null;
  }
  /** @override */
  async init() {
    console.log('[WebGPUTransform] Initializing WebGPU.');
    const adapter = await navigator.gpu.requestAdapter();
    this.device_ = await adapter.requestDevice();

    const rectVerts = new Float32Array([
      1.0, 1.0, 0.0, 1.0, 0.0,
      1.0, -1.0, 0.0, 1.0, 1.0,
      -1.0, -1.0, 0.0, 0.0, 1.0,
      1.0, 1.0, 0.0, 1.0, 0.0,
      -1.0, -1.0, 0.0, 0.0, 1.0,
      -1.0, 1.0, 0.0, 0.0, 0.0,
    ]);

    this.verticesBuffer_ = this.device_.createBuffer({
      size: rectVerts.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.verticesBuffer_.getMappedRange()).set(rectVerts);
    this.verticesBuffer_.unmap();

    this.sampler_ = this.device_.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    console.log(
      '[WebGPUTransform] WebGPU initialized.', `${this.debugPath_}.device_ =`,
      this.device_);
  }

  async initSwapChain_(webcodecsVideoFrame) {
    if (webcodecsVideoFrame.codedWidth !== this.videoWidth_ || webcodecsVideoFrame.codedHeight !== this.videoHeight_) {
      this.videoWidth_ = webcodecsVideoFrame.codedWidth;
      this.videoHeight_ = webcodecsVideoFrame.codedHeight;
      this.canvas_ = document.createElement('canvas');
      this.canvas_.width = this.videoWidth_;
      this.canvas_.height = this.videoHeight_;
      // Fixme: Make it offscreen once WebGPU can support create bitmap from canvas.
      document.getElementById('outputVideo').appendChild(this.canvas_);
      const context = this.canvas_.getContext("gpupresent");
      this.swapChain_ = context.configureSwapChain({
        device: this.device_,
        format: this.swapChainFormat_,
      });
    }
  }

  async initShaderSource_(webcodecsVideoFrame) {

    this.vertextShaderSource_ = `
  [[location(0)]] var<in> position : vec3<f32>;
  [[location(1)]] var<in> uv : vec2<f32>;
  [[location(0)]] var<out> fragUV : vec2<f32>;
  [[builtin(position)]] var<out> Position : vec4<f32>;
  [[stage(vertex)]]
  fn main() -> void {
     Position = vec4<f32>(position, 1.0);
     fragUV = uv;
  }
  `;
    // TODO(jchen10): Handle more pixel formats.
    // TODO(jchen10): Handle more color spaces.
    switch (webcodecsVideoFrame.format_corrected) {
      case "I420":
        this.fragmentShaderSource_ = `
  [[binding(0), set(0)]] var<uniform_constant> mySampler: sampler;
  [[binding(1), set(0)]] var myTextureY: texture_2d<f32>;
  [[binding(2), set(0)]] var myTextureU: texture_2d<f32>;
  [[binding(3), set(0)]] var myTextureV: texture_2d<f32>;
  [[location(0)]] var<in> fragUV : vec2<f32>;
  [[location(0)]] var<out> outColor : vec4<f32>;
  [[stage(fragment)]]
  fn main() -> void {
    var element : vec3<f32>;
    element.r = textureSample(myTextureY, mySampler, fragUV).r;
    element.g = textureSample(myTextureU, mySampler, fragUV).r;
    element.b = textureSample(myTextureV, mySampler, fragUV).r;
    element = mat3x3<f32>(
      vec3<f32>(1.16438353e+00, 1.16438353e+00, 1.16438353e+00),
      vec3<f32>(-2.28029018e-09, -2.13248596e-01, 2.11240172e+00),
      vec3<f32>(1.79274118e+00, -5.32909274e-01, -5.96049432e-10)) * element;
    element = element + vec3<f32>(-9.69429970e-01, 3.00019622e-01, -1.12926030e+00);
    outColor = vec4<f32>(element, 1.0);
    return;
  }
  `;
        break;
      case "NV12":
        this.fragmentShaderSource_ = `
  [[binding(0), set(0)]] var<uniform_constant> mySampler: sampler;
  [[binding(1), set(0)]] var myTextureY: texture_2d<f32>;
  [[binding(2), set(0)]] var myTextureUV: texture_2d<f32>;
  [[location(0)]] var<in> fragUV : vec2<f32>;
  [[location(0)]] var<out> outColor : vec4<f32>;
  [[stage(fragment)]]
  fn main() -> void {
    var element : vec3<f32>;
    element.r = textureSample(myTextureY, mySampler, fragUV).r;
    var rg : vec2<f32>;
    rg = textureSample(myTextureUV, mySampler, fragUV).rg;
    element.g = rg[0];
    element.b = rg[1];
    element = mat3x3<f32>(
      vec3<f32>(1.16438353e+00, 1.16438353e+00, 1.16438353e+00),
      vec3<f32>(-2.28029018e-09, -2.13248596e-01, 2.11240172e+00),
      vec3<f32>(1.79274118e+00, -5.32909274e-01, -5.96049432e-10)) * element;
    element = element + vec3<f32>(-9.69429970e-01, 3.00019622e-01, -1.12926030e+00);
    outColor = vec4<f32>(element, 1.0);
    return;
  }
  `;
        break;
      default:
        console.log("Unsupported pixel format.")
    }

  }

  async initPipeline_(webcodecsVideoFrame) {
    if (webcodecsVideoFrame.format_corrected !== this.videoFormat_) {
      this.videoFormat_ = webcodecsVideoFrame.format_corrected;
      this.initShaderSource_(webcodecsVideoFrame);
      this.pipeline_ = this.device_.createRenderPipeline({
        vertexStage: {
          module: this.device_.createShaderModule({
            code: this.vertextShaderSource_,
          }),
          entryPoint: "main"
        },
        fragmentStage: {
          module: this.device_.createShaderModule({
            code: this.fragmentShaderSource_,
          }),
          entryPoint: "main"
        },

        primitiveTopology: "triangle-list",
        vertexState: {
          vertexBuffers: [{
            arrayStride: 20,
            attributes: [{
              // position
              shaderLocation: 0,
              offset: 0,
              format: "float3"
            }, {
              // uv
              shaderLocation: 1,
              offset: 12,
              format: "float2"
            }]
          }],
        },

        colorStates: [{
          format: this.swapChainFormat_,
        }],
      });
    }
  }

  async initFrameResourcesIfNeeded_(webcodecsVideoFrame) {
    this.initSwapChain_(webcodecsVideoFrame);
    this.initPipeline_(webcodecsVideoFrame);
  }

  /** @override */
  async transform(frame, controller) {
    if (this.device_ === null)
      return;
    // Fixme: frame.format is null if the video frame came from a software decoder and was uploaded 
    // into GMBs on OS_WIN.
    // This needs to fixed in chromium.
    frame.format_corrected = frame.format;
    if (frame.format === null) {
      frame.format_corrected = "NV12";
    }
    const webgpuVideoFrame = this.device_.experimentalImportVideoFrame(frame);
    this.initFrameResourcesIfNeeded_(frame);

    // Assign binding 0 to the sampler.
    let entries = [{
      binding: 0,
      resource: this.sampler_
    }];

    // The rest bindings for all planes.
    function createGPUBindGroupLayoutEntries(webgpuVideoFrame, bindingOffset) {
      let entries = [];
      for (let i = 0; i < webgpuVideoFrame.textureViews.length; ++i) {
        let entry = { binding: i + bindingOffset, resource: webgpuVideoFrame.textureViews[i] };
        entries.push(entry);
      }
      return entries;
    }
    // Merge the bindings.
    Array.prototype.push.apply(entries, createGPUBindGroupLayoutEntries(webgpuVideoFrame, 1));


    const uniformBindGroup = this.device_.createBindGroup({
      layout: this.pipeline_.getBindGroupLayout(0),
      entries: entries
    });

    const commandEncoder = this.device_.createCommandEncoder();
    const textureView = this.swapChain_.getCurrentTexture().createView();

    const renderPassDescriptor = {
      colorAttachments: [{
        attachment: textureView,
        loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      }],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline_);
    passEncoder.setVertexBuffer(0, this.verticesBuffer_);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(6, 1, 0, 0);
    passEncoder.endPass();
    this.device_.queue.submit([commandEncoder.finish()]);
    await this.device_.queue.onSubmittedWorkDone();

    webgpuVideoFrame.destroy();
    frame.close();

    const timestamp = /** @type {number} */ (frame.timestamp);
    // Fixme: This doesn't work for WebGPU, and needs to be fixed in chromium.
    const outputBitmap = await createImageBitmap(this.canvas_);
    const outputFrame = new VideoFrame(outputBitmap, { timestamp });
    outputBitmap.close();
    controller.enqueue(outputFrame);
  }

  /** @override */
  destroy() {
    if (this.device_) {
      console.log('[WebGPUTransform] Destory the WebGPU deice.');
      this.device_ = null;
    }
  }
}
