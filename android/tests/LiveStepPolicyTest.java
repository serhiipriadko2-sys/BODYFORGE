package ru.bodyforge.healthqa;
public final class LiveStepPolicyTest {
    private static int checks;
    private static void check(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
        checks++; System.out.println("PASS " + label);
    }
    public static void main(String[] args) {
        check(LiveStepPolicy.screen("\"ready\"") == LiveStepPolicy.Screen.READY, "ready screen");
        check(LiveStepPolicy.screen("\"busy\"") == LiveStepPolicy.Screen.BUSY, "busy screen");
        check(LiveStepPolicy.screen("\"off\"") == LiveStepPolicy.Screen.OFF, "off screen");
        check(LiveStepPolicy.screen(null) == LiveStepPolicy.Screen.OFF, "null screen fails closed");
        check(LiveStepPolicy.screen("\"ready extra\"") == LiveStepPolicy.Screen.OFF, "unknown screen rejected");
        LiveStepPolicy.Session s = new LiveStepPolicy.Session(100L);
        check(s.count() == 0, "new foreground session starts zero");
        check(!s.accept(99, 200, 1f), "old event rejected");
        check(!s.accept(100, 200, 1f), "baseline event rejected");
        check(!s.accept(201, 200, 1f), "future event rejected");
        check(!s.accept(101, 200, 0f) && !s.accept(101, 200, 2f) && !s.accept(101, 200, Float.NaN), "invalid sensor values rejected");
        check(s.accept(101, 200, 1f), "first genuine-shaped step accepted");
        check(!s.accept(101, 200, 1f), "duplicate timestamp rejected");
        check(s.accept(102, 200, 1f) && s.count() == 2, "two distinct events counted once");
        check(!s.accept(101, 200, 1f) && s.count() == 2, "out of order event rejected");
        check(new LiveStepPolicy.Session(200L).count() == 0, "new visible session independent");
        LiveStepPolicy.Refresh r = new LiveStepPolicy.Refresh();
        check(r.due(100), "first query immediately due");
        int a = r.begin(100);
        check(r.current(a) && !r.due(101), "no concurrent query");
        check(!r.expired(15099) && r.expired(15100), "bounded timeout");
        r.finish();
        check(!r.current(a) && !r.due(60099) && r.due(60100), "late callback rejected; 60s cadence");
        int b = r.begin(60100);
        r.reset();
        check(!r.current(b) && r.due(60101), "hide or revoke invalidates pending result");
        int c = r.begin(60101);
        check(c != b && !r.current(b) && r.current(c), "new epoch never accepts old result");
        r.finish();
        check(!r.current(c), "double callback rejected");
        System.out.println("BODYFORGE_LIVE_STEPS_POLICY_PASS checks="+checks);
    }
}
