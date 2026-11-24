package ru.bodyforge.healthqa;

final class LiveStepPolicy {
    static final String TOKEN = "BODYFORGE-LiveSteps/1";
    static final long REFRESH_MS = 60000L;
    static final long TIMEOUT_MS = 15000L;

    enum Screen { OFF, READY, BUSY }
    static Screen screen(String json) {
        if ("\"ready\"".equals(json)) return Screen.READY;
        if ("\"busy\"".equals(json)) return Screen.BUSY;
        return Screen.OFF;
    }

    static final class Session {
        private final long started;
        private long last;
        private long count;
        Session(long started) { this.started = started; last = started; }
        boolean accept(long timestamp, long now, float value) {
            if (timestamp <= started || timestamp <= last || timestamp > now ||
                value != 1f || count == Long.MAX_VALUE) return false;
            last = timestamp;
            count++;
            return true;
        }
        long count() { return count; }
    }

    static final class Refresh {
        private long nextAt;
        private long deadline;
        private int ticket;
        private boolean pending;
        boolean due(long now) { return !pending && now >= nextAt; }
        int begin(long now) {
            if (!due(now)) throw new IllegalStateException("query not due");
            pending = true;
            deadline = now + TIMEOUT_MS;
            nextAt = now + REFRESH_MS;
            return ++ticket;
        }
        boolean current(int candidate) { return pending && ticket == candidate; }
        boolean expired(long now) { return pending && now >= deadline; }
        void finish() { pending = false; }
        void reset() { ticket++; pending = false; nextAt = 0; }
    }
}
