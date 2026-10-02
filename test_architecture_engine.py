import unittest
from deterministic_analyzer import inspect_code_file, build_relationship_model
from report_builder import build_deterministic_architecture, build_deterministic_improvements


class TestArchitectureEngine(unittest.TestCase):

    def test_no_false_chaining_between_independent_entry_points(self):
        """Verify that multiple main.py files in separate modules are NEVER chained into an artificial graph."""
        file_contents = {
            "crews/job-posting/src/job_posting/main.py": """
from job_posting.crew import JobPostingCrew

def run():
    crew = JobPostingCrew()
    crew.kickoff()

if __name__ == "__main__":
    run()
""",
            "crews/job-posting/src/job_posting/crew.py": """
class JobPostingCrew:
    def __init__(self):
        pass
    def kickoff(self):
        pass
""",
            "crews/recruitment/src/recruitment/main.py": """
from recruitment.crew import RecruitmentCrew

def run():
    crew = RecruitmentCrew()
    crew.kickoff()

if __name__ == "__main__":
    run()
""",
            "crews/recruitment/src/recruitment/crew.py": """
class RecruitmentCrew:
    def __init__(self):
        pass
    def kickoff(self):
        pass
""",
        }

        inspected = {f: inspect_code_file(f, c) for f, c in file_contents.items()}
        model = build_relationship_model(inspected)

        self.assertTrue(model["is_multi_module"])
        self.assertTrue(model["has_relationships"])

        # Check relationships: job_posting/main.py -> job_posting/crew.py
        rel_pairs = [(r["source"], r["target"], r["relationship"]) for r in model["relationships"]]
        
        # Verify job_posting main constructs crew
        has_job_rel = any(
            "job-posting" in src and "job-posting" in tgt and rel in ("constructs", "imports")
            for src, tgt, rel in rel_pairs
        )
        self.assertTrue(has_job_rel, f"Expected job_posting relationship, got: {rel_pairs}")

        # Verify recruitment main constructs crew
        has_rec_rel = any(
            "recruitment" in src and "recruitment" in tgt and rel in ("constructs", "imports")
            for src, tgt, rel in rel_pairs
        )
        self.assertTrue(has_rec_rel, f"Expected recruitment relationship, got: {rel_pairs}")

        # CRITICAL TEST: Verify NO arrow connects job_posting/main.py to recruitment/main.py!
        has_cross_entry_chain = any(
            ("job-posting" in src and "recruitment" in tgt) or ("recruitment" in src and "job-posting" in tgt)
            for src, tgt, _ in rel_pairs
        )
        self.assertFalse(has_cross_entry_chain, "Forbidden cross-module chaining detected!")

        # Test architecture lines output
        arch_lines = "\n".join(build_deterministic_architecture("CrewAI Examples", inspected, ["Python", "CrewAI"]))
        self.assertIn("multiple independently structured examples/modules", arch_lines)
        self.assertNotIn("main.py ➔ main.py", arch_lines)

    def test_unrelated_files_report_no_relationship_established(self):
        """Verify that when files have no import/call relationships, no arrows are invented."""
        file_contents = {
            "src/utils/math_helpers.py": """
def add(a, b):
    return a + b
""",
            "src/formatters/text_cleaner.py": """
def clean(text):
    return text.strip()
""",
        }
        inspected = {f: inspect_code_file(f, c) for f, c in file_contents.items()}
        model = build_relationship_model(inspected)
        self.assertFalse(model["has_relationships"])

        arch_lines = "\n".join(build_deterministic_architecture("Standalone Utils", inspected, ["Python"]))
        self.assertIn("Architecture relationship could not be established from the inspected files", arch_lines)
        self.assertNotIn("➔", arch_lines)
        self.assertNotIn("↓", arch_lines)


if __name__ == "__main__":
    unittest.main()
