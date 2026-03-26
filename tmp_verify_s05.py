import runpy
import traceback

for path in ["tools/validate_schemas.py", "tools/inspect_design_teaching_research.py"]:
    print(f"=== {path} ===")
    try:
        runpy.run_path(path, run_name="__main__")
    except SystemExit as exc:
        print(f"SystemExit: {exc.code}")
    except BaseException:
        traceback.print_exc()
