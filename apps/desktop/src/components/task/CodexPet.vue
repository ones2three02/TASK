<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import CodexMeetingPanel from "./CodexMeetingPanel.vue";

const panelOpen = ref(false);
const petState = ref<"idle" | "recording" | "thinking" | "happy" | "sleeping">("idle");
const showBubble = ref(false);
const bubbleText = ref("哈喽！我是小科，开会戳我哦~");

// Sleep timer for inactivity
let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
const SLEEP_INACTIVITY_MS = 60000; // 1 minute to go to sleep

function resetInactivityTimer() {
  if (petState.value === "recording" || petState.value === "thinking") return;

  if (petState.value === "sleeping") {
    petState.value = "idle";
    showBubbleText("哈喽，我醒啦！");
  }

  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (petState.value === "idle") {
      petState.value = "sleeping";
      showBubbleText("呼呼... 睡着了...");
    }
  }, SLEEP_INACTIVITY_MS);
}

function showBubbleText(text: string, duration = 3000) {
  bubbleText.value = text;
  showBubble.value = true;
  setTimeout(() => {
    showBubble.value = false;
  }, duration);
}

function handlePetClick() {
  panelOpen.value = !panelOpen.value;
  resetInactivityTimer();
  if (panelOpen.value) {
    showBubbleText("开会了！今天记录点什么？", 4000);
  }
}

function handleStateChange(newState: "idle" | "recording" | "thinking" | "happy" | "sleeping") {
  petState.value = newState;
  resetInactivityTimer();

  if (newState === "recording") {
    showBubbleText("收到！会议音频采集中，耳机已就位 🎧", 4000);
  } else if (newState === "thinking") {
    showBubbleText("别急，小科正在拼命构思方案中... ⚡");
  } else if (newState === "happy") {
    showBubbleText("太棒了！方案导入成功！🎉");
  }
}

// Random actions (like blinking or wiggle)
let blinkInterval: ReturnType<typeof setInterval> | undefined;
const isBlinking = ref(false);

onMounted(() => {
  resetInactivityTimer();
  window.addEventListener("mousemove", resetInactivityTimer);
  window.addEventListener("click", resetInactivityTimer);

  // Periodic blink
  blinkInterval = setInterval(() => {
    if (petState.value === "idle" || petState.value === "happy") {
      isBlinking.value = true;
      setTimeout(() => {
        isBlinking.value = false;
      }, 150);
    }
  }, 4500);

  // Initial welcome bubble after 2 seconds
  setTimeout(() => {
    if (petState.value === "idle") {
      showBubble.value = true;
      setTimeout(() => {
        showBubble.value = false;
      }, 4000);
    }
  }, 2000);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", resetInactivityTimer);
  window.removeEventListener("click", resetInactivityTimer);
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (blinkInterval) clearInterval(blinkInterval);
});
</script>

<template>
  <div class="fixed bottom-6 right-6 z-40 select-none flex flex-col items-center">
    <!-- Bubble text -->
    <Transition name="bubble">
      <div v-if="showBubble" class="mb-3 px-3 py-1.5 rounded-xl border border-indigo-500/20 bg-background/90 backdrop-blur-md text-[10px] font-medium text-foreground shadow-lg max-w-[160px] text-center leading-relaxed pointer-events-none relative">
        {{ bubbleText }}
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 border-r border-b border-indigo-500/20 bg-background rotate-45" />
      </div>
    </Transition>

    <!-- The Codex Pet -->
    <div
      class="w-16 h-16 cursor-pointer transform active:scale-95 transition-all duration-300 relative group"
      :class="{
        'animate-bounce-custom': petState === 'happy',
        'animate-breath': petState === 'idle',
        'animate-breath-slow': petState === 'sleeping',
        'animate-float': petState === 'recording',
        'animate-wiggle': petState === 'thinking',
      }"
      @click="handlePetClick"
    >
      <!-- Aura blur background -->
      <div
        class="absolute inset-0.5 rounded-full filter blur-md opacity-60 transition-all duration-500"
        :class="{
          'bg-indigo-500 animate-pulse': petState === 'idle',
          'bg-emerald-500 animate-pulse': petState === 'recording',
          'bg-purple-500 animate-pulse': petState === 'thinking',
          'bg-pink-500 scale-110': petState === 'happy',
          'bg-slate-700 opacity-30': petState === 'sleeping',
        }"
      />

      <!-- Pet Body SVG -->
      <svg viewBox="0 0 100 100" class="w-full h-full relative z-10 drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
        <!-- Headphones (Recording Mode) -->
        <g v-if="petState === 'recording'" class="animate-pulse">
          <path d="M 12,50 A 38,38 0 0,1 88,50" fill="none" stroke="rgba(52, 211, 153, 0.85)" stroke-width="6" stroke-linecap="round" />
          <rect x="6" y="42" rx="4" ry="4" width="12" height="20" fill="#10b981" />
          <rect x="82" y="42" rx="4" ry="4" width="12" height="20" fill="#10b981" />
        </g>

        <!-- Body Outer Shell (Glassmorphism effect) -->
        <circle cx="50" cy="50" r="38" fill="url(#bodyGradient)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.5" />

        <!-- Codex Core / Heart Reactor (Breathes via CSS) -->
        <polygon points="50,48 58,58 50,68 42,58" fill="url(#coreGradient)" class="origin-center" :class="petState === 'thinking' ? 'animate-spin-slow' : 'animate-pulse'" />

        <!-- Eyes -->
        <!-- 1. Sleeping -->
        <g v-if="petState === 'sleeping'">
          <path d="M 28,45 L 40,45" stroke="#64748b" stroke-width="3.5" stroke-linecap="round" />
          <path d="M 60,45 L 72,45" stroke="#64748b" stroke-width="3.5" stroke-linecap="round" />
        </g>
        <!-- 2. Happy -->
        <g v-else-if="petState === 'happy'">
          <path d="M 28,48 Q 34,38 40,48" fill="none" stroke="#ec4899" stroke-width="4.5" stroke-linecap="round" />
          <path d="M 60,48 Q 66,38 72,48" fill="none" stroke="#ec4899" stroke-width="4.5" stroke-linecap="round" />
        </g>
        <!-- 3. Thinking -->
        <g v-else-if="petState === 'thinking'">
          <!-- Loading style ring eyes -->
          <circle cx="34" cy="45" r="6" fill="none" stroke="#a78bfa" stroke-width="3.5" stroke-dasharray="12,12" class="animate-spin origin-[34px_45px]" />
          <circle cx="66" cy="45" r="6" fill="none" stroke="#a78bfa" stroke-width="3.5" stroke-dasharray="12,12" class="animate-spin origin-[66px_45px]" />
        </g>
        <!-- 4. Recording / Speech -->
        <g v-else-if="petState === 'recording'">
          <ellipse cx="34" cy="45" rx="6" ry="8" fill="#10b981" />
          <ellipse cx="66" cy="45" rx="6" ry="8" fill="#10b981" />
          <circle cx="36" cy="43" r="2.5" fill="#ffffff" />
          <circle cx="68" cy="43" r="2.5" fill="#ffffff" />
        </g>
        <!-- 5. Blinking -->
        <g v-else-if="isBlinking">
          <path d="M 28,45 Q 34,45 40,45" stroke="rgba(255, 255, 255, 0.85)" stroke-width="4.5" stroke-linecap="round" />
          <path d="M 60,45 Q 66,45 72,45" stroke="rgba(255, 255, 255, 0.85)" stroke-width="4.5" stroke-linecap="round" />
        </g>
        <!-- 6. Normal / Idle -->
        <g v-else>
          <circle cx="34" cy="45" r="7.5" fill="#818cf8" />
          <circle cx="66" cy="45" r="7.5" fill="#818cf8" />
          <!-- Eye highlights -->
          <circle cx="36" cy="42" r="3" fill="#ffffff" />
          <circle cx="68" cy="42" r="3" fill="#ffffff" />
          <!-- Cheeks (cute blush) -->
          <circle cx="26" cy="55" r="4" fill="rgba(244, 63, 94, 0.4)" />
          <circle cx="74" cy="55" r="4" fill="rgba(244, 63, 94, 0.4)" />
        </g>

        <!-- Cute Cat Ears -->
        <path d="M 18,22 Q 12,6 28,14 Z" fill="url(#bodyGradient)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />
        <path d="M 82,22 Q 88,6 72,14 Z" fill="url(#bodyGradient)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />

        <!-- Sparkles (Happy State) -->
        <g v-if="petState === 'happy'">
          <path d="M 12,20 L 15,25 L 12,30 L 9,25 Z" fill="#f43f5e" class="animate-pulse" />
          <path d="M 88,20 L 91,25 L 88,30 L 85,25 Z" fill="#f43f5e" class="animate-pulse" />
        </g>

        <!-- Sleep bubbles (Sleeping State) -->
        <g v-if="petState === 'sleeping'" class="animate-bounce" style="animation-duration: 2s">
          <circle cx="85" cy="22" r="5" fill="rgba(99, 102, 241, 0.2)" />
          <text x="82" y="25" font-size="10" fill="#6366f1" font-family="monospace">z</text>
        </g>

        <!-- Defs for Gradients -->
        <defs>
          <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b" stop-opacity="0.9" />
            <!-- Deep indigo -->
            <stop offset="60%" stop-color="#312e81" stop-opacity="0.8" />
            <stop offset="100%" stop-color="#4f46e5" stop-opacity="0.85" />
          </linearGradient>
          <linearGradient id="coreGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#ec4899" />
            <!-- Hot Pink -->
            <stop offset="100%" stop-color="#8b5cf6" />
            <!-- Violet -->
          </linearGradient>
        </defs>
      </svg>
    </div>

    <!-- The Meeting Panel Component -->
    <CodexMeetingPanel :open="panelOpen" :pet-state="petState" @close="panelOpen = false" @state-change="handleStateChange" />
  </div>
</template>

<style scoped>
/* Transits */
.bubble-enter-active,
.bubble-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.bubble-enter-from,
.bubble-leave-to {
  opacity: 0;
  transform: scale(0.8) translateY(10px);
}

/* Animations */
@keyframes breath {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.02);
  }
}
.animate-breath {
  animation: breath 3.5s ease-in-out infinite;
}

@keyframes breath-slow {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-2px) scale(1.01);
  }
}
.animate-breath-slow {
  animation: breath-slow 6s ease-in-out infinite;
}

@keyframes bounce-custom {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  30% {
    transform: translateY(-16px) scale(1.05, 0.95);
  }
  50% {
    transform: translateY(0) scale(0.95, 1.05);
  }
  70% {
    transform: translateY(-6px) scale(1);
  }
}
.animate-bounce-custom {
  animation: bounce-custom 1.2s ease-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  33% {
    transform: translateY(-6px) rotate(-2deg);
  }
  66% {
    transform: translateY(-2px) rotate(2deg);
  }
}
.animate-float {
  animation: float 4s ease-in-out infinite;
}

@keyframes wiggle {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-3deg) scale(0.98);
  }
  75% {
    transform: rotate(3deg) scale(1.02);
  }
}
.animate-wiggle {
  animation: wiggle 0.6s ease-in-out infinite;
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.animate-spin-slow {
  animation: spin-slow 4s linear infinite;
}
</style>
