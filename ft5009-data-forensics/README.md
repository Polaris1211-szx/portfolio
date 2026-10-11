# FT5009 Individual Assignment 1

**Project:** Reading the Market: Data Forensics & Quality  
**Student:** Shu Zixuan  
**Student ID:** [redacted]

## 1. Project overview

This project examines ten years of daily OHLCV market data and contains three parts:

- **Part A - Data quality:** duplicates, exchange-calendar gaps, stale prices, return outliers, invalid volume, and adjusted-versus-raw prices around a stock split.
- **Part B - Benford forensic screen:** individual-stock and pooled leading-digit tests, followed by a controlled fabrication experiment.
- **Part C - Mini-index and point-in-time analysis:** initial-market-cap-weighted and equal-initial-weight buy-and-hold indices, weight drift, survivorship bias, and point-in-time membership.

## 2. Submission structure

```text
FT5009_[redacted]_individual_assignment1/
├── code/
│   ├── assignment1.ipynb
│   ├── requirements.txt
│   └── README.md
├── data/
│   ├── AAPL_raw.parquet
│   ├── JPM_raw.parquet
│   ├── XOM_raw.parquet
│   ├── AMZN_raw.parquet
│   ├── AAPL_shares_outstanding.parquet
│   ├── JPM_shares_outstanding.parquet
│   └── XOM_shares_outstanding.parquet
└── report.pdf
```

The `*_raw.parquet` files are the immutable raw-cache layer. The Notebook never overwrites them. All profiling, cleaning and analysis operate on separate in-memory working copies.

## 3. Universe and data window

The three main stocks are:

- **AAPL** - Apple Inc.
- **JPM** - JPMorgan Chase & Co.
- **XOM** - Exxon Mobil Corporation

**AMZN** (Amazon.com, Inc.) is included as the corporate-action case because its 20-for-1 stock split falls within the sample window.

The analysis covers daily observations from **1 September 2016 through 1 September 2026**. In the Notebook, `END_DATE` is set to `2026-09-02` because the `yfinance` end date is exclusive. Each stock contains 2,513 valid trading-session observations.

## 4. Data sources

The OHLCV data were originally obtained from [Yahoo Finance](https://finance.yahoo.com/) through [yfinance](https://github.com/ranaroussi/yfinance) with `auto_adjust=False` and corporate-action fields enabled. Historical shares-outstanding observations were also obtained through `yfinance` before submission. Both datasets are supplied as local parquet caches.

Historical-price pages used for source traceability and manual review:

- [AAPL history](https://finance.yahoo.com/quote/AAPL/history/)
- [JPM history](https://finance.yahoo.com/quote/JPM/history/)
- [XOM history](https://finance.yahoo.com/quote/XOM/history/)
- [AMZN history](https://finance.yahoo.com/quote/AMZN/history/)

External price pages and market-news links are supporting evidence only. They are not runtime dependencies.

## 5. Environment and dependencies

The submitted Notebook was executed with Python 3.13.9. All analytical package versions are pinned in `requirements.txt`:

```text
pandas==2.3.3
numpy==2.3.5
scipy==1.16.3
matplotlib==3.10.6
yfinance==1.7.0
pyarrow==21.0.0
pandas-market-calendars==5.4.0
```

From the submission root, an optional virtual environment can be created as follows:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r code/requirements.txt
```

On Windows, activate the environment with `.venv\Scripts\activate`.

## 6. How to run

1. Extract the submitted zip archive without changing its directory structure.
2. Install the pinned dependencies.
3. Open `code/assignment1.ipynb` in JupyterLab, Jupyter Notebook, or VS Code with Jupyter support.
4. Select the environment containing the installed packages.
5. Choose **Restart Kernel and Run All Cells**.

Run the Notebook either from the submission root or from the `code/` directory. Its path logic supports both locations. The cells are already arranged in the required execution order.

## 7. Offline reproducibility

The grading path is deliberately offline-first:

- OHLCV data are read only from `data/*_raw.parquet`.
- Shares-outstanding data are read only from `data/*_shares_outstanding.parquet`.
- The submitted execution path does not call `yf.download()` or `get_shares_full()`.
- A missing, empty, malformed or incomplete cache raises an explicit error instead of triggering a network request or fabricating replacement data.

Accordingly, every figure and reported number can be regenerated from the submitted files without internet access.

## 8. Notebook organisation

```text
1. Setup and Configuration
2. Data Collection and Raw Data Cache

3. Part A - Data Quality Report
   3.1 Duplicate Check
   3.2 Trading-Calendar Gap Check
   3.3 Stale Price Check
   3.4 Return Outlier Check
   3.5 Zero or Negative Volume Check
   3.6 Corporate Action: Raw vs Adjusted Price
   3.7 Data Quality Summary and Cleaned Dataset

4. Part B - Benford Forensic Screen
   4.1 Construction of Benford Test Series
   4.2 Individual and Pooled Tests
   4.3 Interpretation
   4.4 Detection Experiment

5. Part C - Mini-index and the Point-in-Time Trap
   5.1 Build the Two Indices
   5.2 Plot, Report Weights, and Explain Drift
   5.3 Point-in-Time Question
```

## 9. Main reproduction checkpoints

After a complete run, the principal results should include:

- 0 duplicate dates or rows, 0 exchange-calendar gaps and 0 non-positive volume observations.
- One reviewed AMZN repeated-close run on 26-28 September 2023; all three observations are retained.
- 257 robust-z return flags, classified as 6 possible bad-tick candidates, 139 likely genuine moves and 112 needs-review cases. No bad tick is confirmed.
- For the AMZN split demonstration, a naive nominal-price return of approximately -94.90%, compared with an adjusted return of approximately +1.99%; the absolute return error is approximately 96.89 percentage points.
- Pooled Benford rejection for volume and value traded, but failure to reject for absolute price change at the 5% level.
- Under the stated detection design, 200 fabricated rows (approximately 2.58% contamination) are the smallest tested amount detected with at least 95% reliability; the estimated detection rate is 97.0%.
- Final index levels of 881.13 for the initial-market-cap-weighted portfolio and 770.26 for the equal-initial-weight portfolio.
- Cap-weight drift from 48.82% to 73.81% for AAPL, 20.61% to 16.06% for JPM, and 30.57% to 10.13% for XOM.

## 10. Corporate-action treatment

### AMZN split analysis

AMZN implemented a 20-for-1 stock split on 6 June 2022. Yahoo Finance retrospectively expresses pre-split historical `Close` observations on the later split basis. Therefore, even with `auto_adjust=False`, the cached pre-split `Close` does not display the approximately twentyfold contemporaneous nominal-price discontinuity.

Part A reconstructs the contemporaneous nominal close in a separate analytical copy by multiplying pre-split Yahoo `Close` observations by their applicable future split factor. This reconstruction is required only to demonstrate the return error that would arise from treating the mechanical split as an ordinary investment loss.

No further split adjustment is applied to `Adj Close`. Returns, the outlier screen, Benford absolute price change and the index paths use the already adjusted series. Reapplying the split factor to those calculations would double-adjust the data. The reconstructed nominal series never replaces the raw cache and is not used downstream.

### AAPL initial market capitalisation

Yahoo also retrospectively expresses AAPL's 2016 historical `Close` on the basis of its later 4-for-1 split, whereas the historical shares observation remains on its contemporaneous pre-split basis. The initial AAPL share count is therefore converted to the same split basis as the historical price before calculating initial market capitalisation. This is a unit-consistency conversion, not a claim that the converted share count literally existed in 2016.

## 11. Methodological reproducibility notes

- Robust-z flags are investigation triggers, not automatic deletions.
- The 20-session volume window, 20th/80th percentile cut-offs, three-session reversal horizon and 50% reversal threshold are transparent analyst-defined triage rules, not exchange standards.
- The Benford experiment uses random seed `5009`.
- The fabrication compression parameter (`lambda = 0.50`), 1,000 simulations, 95% control interval and 95% reliability criterion are experimental design choices rather than standard conclusions of Benford's Law.
- No observation is removed because the available evidence does not confirm a data error. Suspicious observations are retained and flagged.

## 12. AI-use disclosure

AI tools were used to assist with debugging, report-formatting revisions, and guidance on writing mathematical formulas in Markdown.

The final code, results and written submission were reviewed by the student. The student understands and can explain the code logic, formulas, methodological choices and reported findings, and takes responsibility for the submitted work.
