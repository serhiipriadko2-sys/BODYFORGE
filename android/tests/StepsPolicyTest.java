package ru.bodyforge.healthqa;

import java.time.Instant;
import java.time.ZoneId;

public final class StepsPolicyTest {
    private static int checks;
    private static void check(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
        checks++;
        System.out.println("PASS " + message);
    }
    public static void main(String[] args) {
        String base = "https://appassets.androidplatform.net";
        String page = base + "/";
        String route = base + StepsPolicy.PATH;
        check(StepsPolicy.allowsOpen(page, route, true, true, false, "GET"), "trusted gesture opens native screen");
        check(StepsPolicy.allowsOpen(base+"/index.html#challenge",route,true,true,false,"GET"), "local hash navigation");
        check(!StepsPolicy.allowsOpen(page, route, false,true,false,"GET"), "iframe blocked");
        check(!StepsPolicy.allowsOpen(page, route, true,false,false,"GET"), "no user gesture blocked");
        check(!StepsPolicy.allowsOpen(page, route, true,true,true,"GET"), "redirect blocked");
        check(!StepsPolicy.allowsOpen(page, route, true,true,false,"POST"), "non-GET blocked");
        check(!StepsPolicy.allowsOpen("https://example.org/",route,true,true,false,"GET"), "external source blocked");
        check(!StepsPolicy.allowsOpen(base+"/assets/foo.html",route,true,true,false,"GET"), "non-entry source blocked");
        check(!StepsPolicy.allowsOpen(page,route+"?data=1",true,true,false,"GET"), "query blocked");
        check(!StepsPolicy.allowsOpen(page,route+"#fragment",true,true,false,"GET"), "fragment blocked");
        check(!StepsPolicy.allowsOpen(page,"https://appassets.androidplatform.net.evil.test"+StepsPolicy.PATH,true,true,false,"GET"), "lookalike blocked");
        check(!StepsPolicy.allowsOpen(page,"https://user@appassets.androidplatform.net"+StepsPolicy.PATH,true,true,false,"GET"), "userinfo blocked");
        check(!StepsPolicy.allowsOpen(page,"https://appassets.androidplatform.net:8443"+StepsPolicy.PATH,true,true,false,"GET"), "wrong port blocked");
        check(!StepsPolicy.allowsOpen(null,route,true,true,false,"GET"), "null page blocked");
        check(StepsPolicy.isReservedPath(route+"?x=1"), "reserved route cannot become asset");
        ZoneId moscow=ZoneId.of("Europe/Moscow");
        StepsPolicy.DayWindow today = new StepsPolicy.DayWindow(Instant.parse("2026-11-24T12:00:00Z"),moscow);
        check(today.start.equals(Instant.parse("2026-11-23T21:00:00Z")) && today.valid(), "local midnight correct");
        check(!today.isCurrent(Instant.parse("2026-11-24T21:00:00Z"),moscow), "stale midnight result rejected");
        check(!today.isCurrent(today.end,ZoneId.of("UTC")), "timezone change rejected");
        check(!today.isCurrent(today.end.minusSeconds(1),moscow), "backward clock rejected");
        ZoneId london=ZoneId.of("Europe/London");
        StepsPolicy.DayWindow dst=new StepsPolicy.DayWindow(Instant.parse("2026-10-25T23:00:00Z"),london);
        check(dst.start.equals(Instant.parse("2026-10-24T23:00:00Z")), "DST midnight uses zone rules");
        check(!new StepsPolicy.DayWindow(today.start,moscow).valid(), "exact midnight empty interval");
        check(!StepsPolicy.validCount(null) && !StepsPolicy.validCount(-1L), "no data never becomes zero");
        check(StepsPolicy.validCount(0L) && StepsPolicy.validCount(5123L), "actual nonnegative result accepted");
        System.out.println("BODYFORGE_NATIVE_POLICY_PASS checks="+checks);
    }
}
