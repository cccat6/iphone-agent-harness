"""Validate design fixtures and rejection paths; sends no network or HID input."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
CAPABILITIES = {
    "input.pointer", "input.key", "input.home", "capture.frames",
    "capture.motion", "harness.skills", "model.images",
}


def load(path):
    def nonfinite(value):
        raise ValueError(f"non-finite JSON number: {value}")
    return json.loads(Path(path).read_text(), parse_constant=nonfinite)


def reject_unless(condition, message):
    if not condition:
        raise ValueError(message)


def validate_plan(plan, *, expected_target="phone-A", expected_epoch=1,
                  known_frames=frozenset({"frame-before"}), capabilities=CAPABILITIES):
    """Contract-level validation, not a production executor or device compiler."""
    Draft202012Validator(load(ROOT / "specs/action-plan.schema.json")).validate(plan)
    reject_unless(plan["targetId"] == expected_target, "target mismatch")
    reject_unless(plan["orientationEpoch"] == expected_epoch, "stale orientation")
    reject_unless(plan["basedOnFrameId"] in known_frames, "unknown evidence")
    ids = set()
    requested_frames = 0

    def require(name):
        reject_unless(name in capabilities, f"unsupported capability: {name}")

    def frames(spec):
        nonlocal requested_frames
        require("capture.frames")
        requested_frames += spec["count"]
        reject_unless(requested_frames <= 24, "plan exceeds aggregate frame budget")
        reject_unless(spec["count"] == 1 or spec["intervalMs"] > 0,
                      "multiple frames require a positive requested interval")
        reject_unless((spec["count"] - 1) * spec["intervalMs"] <= spec["timeoutMs"],
                      "requested sample window exceeds its deadline")
        return spec["timeoutMs"]

    def motion(step):
        reject_unless(step["id"] not in ids, "duplicate step id")
        ids.add(step["id"])
        op = step["op"]
        if op in {"tap", "drag", "swipe", "pointer_sequence"}:
            require("input.pointer")
        if op == "tap":
            return step["holdMs"]
        if op in {"drag", "swipe"}:
            points = step["path"]
            reject_unless(points[0]["tMs"] == 0, "path must start at t=0")
            reject_unless(all(b["tMs"] > a["tMs"] for a, b in zip(points, points[1:])),
                          "path times must strictly increase")
            if op == "swipe":
                a, b = points[-2:]
                reject_unless((a["x"], a["y"]) != (b["x"], b["y"]),
                              "swipe must finish with motion")
            duration = points[-1]["tMs"] + step.get("endHoldMs", 0)
            reject_unless(duration <= 3000, "input hold exceeds design limit")
            return duration
        if op == "pointer_sequence":
            events = step["events"]
            reject_unless(events[0]["phase"] == "down" and events[0]["atMs"] == 0,
                          "pointer sequence must begin with down at zero")
            reject_unless(events[-1]["phase"] == "up", "pointer sequence must release")
            reject_unless(all(e["phase"] == "move" for e in events[1:-1]),
                          "only one pointer press is supported per sequence")
            for a, b in zip(events, events[1:]):
                reject_unless(b["atMs"] > a["atMs"] or
                              (b["phase"] == "up" and b["atMs"] == a["atMs"]),
                              "pointer times must increase except immediate final release")
            reject_unless(events[-1]["atMs"] > 0, "zero-duration pointer sequence")
            reject_unless((events[-1]["x"], events[-1]["y"]) ==
                          (events[-2]["x"], events[-2]["y"]), "up cannot teleport pointer")
            return events[-1]["atMs"]
        if op == "home":
            require("input.home")
            return 100  # conservative fixture estimate, not measured HID timing
        if op == "key":
            require("input.key")
            return step["holdMs"]
        if op == "wait":
            return step["durationMs"]
        if op == "capture":
            return frames(step["frames"])
        if op == "observe":
            require("capture.motion")
            return max(frames(step["frames"]), motion(step["motion"]))
        raise ValueError("unsupported operation")

    duration = 0
    for i, step in enumerate(plan["steps"]):
        if step["op"] == "capture" and step["review"]:
            reject_unless(i == len(plan["steps"]) - 1, "review must end the plan")
        duration += motion(step)
    reject_unless(duration <= plan["maxExecutionMs"], "plan cannot fit its declared budget")
    return duration


def segment_hash(segment):
    unsigned = {key: value for key, value in segment.items() if key != "payloadHash"}
    canonical = json.dumps(unsigned, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def validate_segment(segment, *, expected_boot="boot-demo", expected_target="phone-A",
                     expected_client="client-A", expected_lease="lease-A"):
    Draft202012Validator(load(ROOT / "specs/device-segment.schema.json")).validate(segment)
    reject_unless(segment["payloadHash"] == segment_hash(segment), "segment hash mismatch")
    reject_unless(segment["bootId"] == expected_boot, "stale device boot")
    reject_unless(segment["targetId"] == expected_target, "segment target mismatch")
    reject_unless(segment["clientId"] == expected_client and segment["leaseId"] == expected_lease,
                  "invalid control lease")
    held_since = {}
    previous = -1
    for event in segment["events"]:
        at = event["atMs"]
        reject_unless(at >= previous, "reports must be ordered")
        previous = at
        kind = event["kind"]
        held = (event["buttons"] != 0 if kind == "pointer" else
                bool(event["modifiers"] or event["usages"]) if kind == "keyboard" else
                event["usage"] != 0)
        if held:
            held_since.setdefault(kind, at)
        elif kind in held_since:
            reject_unless(at - held_since.pop(kind) <= 3000, "segment hold exceeds limit")
    reject_unless(not held_since, "segment leaves input held")
    reject_unless(previous <= 5000, "segment execution exceeds limit")


def validate_skill(directory):
    manifest = load(directory / "manifest.json")
    Draft202012Validator(load(ROOT / "specs/skill-manifest.schema.json")).validate(manifest)
    seen = set()
    for entry in manifest["files"]:
        rel = entry["path"]
        reject_unless(rel not in seen, "duplicate package file")
        seen.add(rel)
        reject_unless(Path(rel).suffix in {".md", ".json", ".png", ".jpg", ".jpeg", ".webp"},
                      "executable package file is unsupported")
        file = directory / rel
        reject_unless(not file.is_symlink(), "symlink package file")
        reject_unless(file.resolve().is_relative_to(directory.resolve()), "package path escape")
        data = file.read_bytes()
        reject_unless(len(data) == entry["bytes"], "package size mismatch")
        reject_unless(hashlib.sha256(data).hexdigest() == entry["sha256"], "package hash mismatch")
    reject_unless(manifest["entry"] in seen, "missing entry file")


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.plan = load(ROOT / "specs/examples/batch-with-checkpoint.plan.json")

    def test_all_examples(self):
        for path in sorted((ROOT / "specs/examples").glob("*.plan.json")):
            with self.subTest(path=path.name):
                validate_plan(load(path))

    def test_schema_definitions(self):
        for path in sorted((ROOT / "specs").glob("*.schema.json")):
            Draft202012Validator.check_schema(load(path))

    def test_device_segment(self):
        validate_segment(load(ROOT / "specs/examples/swipe.segment.json"))

    def test_old_device_boot_rejected(self):
        with self.assertRaisesRegex(ValueError, "boot"):
            validate_segment(load(ROOT / "specs/examples/swipe.segment.json"), expected_boot="new-boot")

    def test_cross_phone_segment_rejected(self):
        with self.assertRaisesRegex(ValueError, "target"):
            validate_segment(load(ROOT / "specs/examples/swipe.segment.json"), expected_target="phone-B")

    def test_wrong_control_lease_rejected(self):
        with self.assertRaisesRegex(ValueError, "lease"):
            validate_segment(load(ROOT / "specs/examples/swipe.segment.json"), expected_client="client-B")

    def test_changed_payload_rejected(self):
        segment = load(ROOT / "specs/examples/swipe.segment.json")
        segment["events"][0]["x"] += 1
        with self.assertRaisesRegex(ValueError, "hash"):
            validate_segment(segment)

    def test_device_segment_must_release(self):
        segment = load(ROOT / "specs/examples/swipe.segment.json")
        segment["events"].pop()
        segment["payloadHash"] = segment_hash(segment)
        with self.assertRaisesRegex(ValueError, "held"):
            validate_segment(segment)

    def test_device_report_order(self):
        segment = load(ROOT / "specs/examples/swipe.segment.json")
        segment["events"][2]["atMs"] = 50
        segment["payloadHash"] = segment_hash(segment)
        with self.assertRaisesRegex(ValueError, "ordered"):
            validate_segment(segment)

    def test_result_fixture(self):
        value = load(ROOT / "specs/examples/completed.result.json")
        Draft202012Validator(load(ROOT / "specs/action-result.schema.json")).validate(value)
        self.assertEqual(value["outcome"], "not_evaluated")
        self.assertEqual([s["id"] for s in value["steps"]], [s["id"] for s in self.plan["steps"]])

    def test_skill_hash_and_files(self):
        validate_skill(ROOT / "apps/web/skills/challenge-router")

    def test_wrong_target(self):
        with self.assertRaisesRegex(ValueError, "target"):
            validate_plan(self.plan, expected_target="phone-B")

    def test_stale_orientation(self):
        with self.assertRaisesRegex(ValueError, "orientation"):
            validate_plan(self.plan, expected_epoch=2)

    def test_unknown_frame(self):
        with self.assertRaisesRegex(ValueError, "evidence"):
            validate_plan(self.plan, known_frames=set())

    def test_missing_pointer_capability(self):
        with self.assertRaisesRegex(ValueError, "capability"):
            validate_plan(self.plan, capabilities=CAPABILITIES - {"input.pointer"})

    def test_review_requires_model_before_more_input(self):
        self.plan["steps"][2]["review"] = True
        with self.assertRaisesRegex(ValueError, "review"):
            validate_plan(self.plan)

    def test_duplicate_ids(self):
        self.plan["steps"][1]["id"] = self.plan["steps"][0]["id"]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_plan(self.plan)

    def test_backward_path_time(self):
        self.plan["steps"][3]["path"][2]["tMs"] = 100
        with self.assertRaisesRegex(ValueError, "times"):
            validate_plan(self.plan)

    def test_stationary_swipe_tail(self):
        points = self.plan["steps"][3]["path"]
        points[-1].update(x=points[-2]["x"], y=points[-2]["y"])
        with self.assertRaisesRegex(ValueError, "motion"):
            validate_plan(self.plan)

    def test_budget(self):
        self.plan["maxExecutionMs"] = 1000
        with self.assertRaisesRegex(ValueError, "budget"):
            validate_plan(self.plan)

    def test_multiframe_window(self):
        self.plan["steps"][2]["frames"] = {"count":8,"intervalMs":4000,"timeoutMs":5000}
        with self.assertRaisesRegex(ValueError, "window"):
            validate_plan(self.plan)

    def test_aggregate_frame_budget(self):
        sample = {"id":"a", "op":"capture", "frames":{"count":8,"intervalMs":100,"timeoutMs":1000}, "review":False,"label":"fixture"}
        self.plan["steps"] = [{**sample, "id":str(i)} for i in range(4)]
        with self.assertRaisesRegex(ValueError, "frame budget"):
            validate_plan(self.plan)

    def test_unreleased_pointer(self):
        plan = load(ROOT / "specs/examples/pointer-sequence.plan.json")
        plan["steps"][0]["events"][-1]["phase"] = "move"
        with self.assertRaisesRegex(ValueError, "release"):
            validate_plan(plan)

    def test_pointer_up_cannot_move(self):
        plan = load(ROOT / "specs/examples/pointer-sequence.plan.json")
        plan["steps"][0]["events"][-1]["x"] = 9000
        with self.assertRaisesRegex(ValueError, "teleport"):
            validate_plan(plan)

    def test_no_hidden_terminal_delay_in_swipe(self):
        from jsonschema import ValidationError
        self.plan["steps"][3]["endHoldMs"] = 100
        with self.assertRaises(ValidationError):
            validate_plan(self.plan)

    def test_truncated_json_is_not_executable(self):
        with self.assertRaises(json.JSONDecodeError):
            json.loads(json.dumps(self.plan)[:-8])

    def test_no_script_operation(self):
        from jsonschema import ValidationError
        self.plan["steps"][0] = {"id":"script","op":"eval","code":"arbitrary()"}
        with self.assertRaises(ValidationError):
            validate_plan(self.plan)

    def test_motion_sampling_requires_capability(self):
        plan = load(ROOT / "specs/examples/observe-during-motion.plan.json")
        with self.assertRaisesRegex(ValueError, "capability"):
            validate_plan(plan, capabilities=CAPABILITIES - {"capture.motion"})



if __name__ == "__main__":
    unittest.main(verbosity=2)
