# Sudoku Logic Inference System

An interactive Sudoku solver built around knowledge representation and symbolic inference. The system demonstrates how the same puzzle can be represented as propositional logic or definite Horn rules and solved with different inference strategies.

## Highlights

- Encodes Sudoku givens, cell-value assignments, row/column/box uniqueness, and candidate constraints as CNF clauses.
- Builds a Horn-rule knowledge base with `Is` and `Not` atoms, including elimination and last-candidate rules.
- Implements backward chaining with conclusion indexing, memoisation, cycle detection, progress retries, and proof-trace reconstruction.
- Provides forward chaining, backward chaining, full-grid solving, targeted cell entailment, algorithm switching, and Tutor Mode through Streamlit.
- Notebook evaluation records all 729 cell/value entailment queries passing on the supplied test puzzle.

## Run

```bash
pip install -r requirements.txt
streamlit run sudoku_app.py
```

## Personal contribution

Core developer. Implemented the solver baseline, CNF and Horn representations, backward-chaining inference and the Streamlit interface. Deployment was handled separately by a teammate.

## Demo

The original Streamlit deployment may sleep after inactivity. Open the link and choose **Yes, get this app back up!** if prompted:

https://sudoku-assignment-xznrjngyipqt7kg8px6tul.streamlit.app/
