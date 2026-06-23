<script>
</script>

<div
    class="progress-container h-1 bg-background"
    role="progressbar"
    aria-indeterminate="true"
>
    <div class="progress-bar bg-green-500"></div>
</div>

<style>
    .progress-container {
        width: 100%;
        position: relative;
        overflow: hidden;
        border-radius: 9999px;
    }

    .progress-bar {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 60%; /* Width of the moving animated indicator block */
        border-radius: 9999px;

        /* 1. Use a gradient to fade the leading and trailing edges */
        background: linear-gradient(
            to right,
            transparent 0%,
            #22c55e 30%,
            #7ce9a4 70%
        );

        /* 2. Apply a directional-feeling blur */
        filter: blur(2px);

        /* 3. Keep your existing animation */
        animation: indeterminate-move 0.5s infinite ease-in-out;
    }

    @keyframes indeterminate-move {
        0% {
            left: -100%;
        }
        100% {
            left: 100%;
        }
    }
</style>
