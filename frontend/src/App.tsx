import { useMemo, useState, useRef, useEffect } from "react";
import {
  AppBar, Toolbar, Typography, Container, Box, Card, CardContent, TextField,
  Button, Select, MenuItem, Chip, IconButton, LinearProgress, Collapse,
  CssBaseline, FormControl, InputLabel, Stack, Divider, Paper
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { start, submitAnswer, continueNext, type Level, type QuestionPayload } from "./api";

const LEVELS: Level[] = [
  "Elementary School Level",
  "Middle School Level",
  "High School Level",
  "Undergraduate Level",
  "Advanced Undergraduate Level",
  "Graduate Level",
  "Advanced Graduate Level",
];

export default function App() {
  // ----- App state -----
  const [session, setSession] = useState<string>("");
  const [subject, setSubject] = useState<string>("atoms");
  const [level, setLevel] = useState<Level>("High School Level");

  // Current question shown
  const [q, setQ] = useState<QuestionPayload | null>(null);

  // After Submit, we cache the next question and whether the batch is complete.
  const [pendingNext, setPendingNext] = useState<QuestionPayload | null>(null);
  const [pendingBatchComplete, setPendingBatchComplete] = useState<boolean>(false);

  // User input + feedback
  const [answer, setAnswer] = useState<string>("");
  const [feedback, setFeedback] = useState<{
    score: number; reason: string; explanation: string; correct: string;
  } | null>(null);

  // Batch summary screen (after last question)
  const [batchSummary, setBatchSummary] = useState<{ count: number; total: number; avg: number } | null>(null);

  // Progress: how many questions have been SUBMITTED in this batch
  const [answeredCount, setAnsweredCount] = useState<number>(0);

  const [loading, setLoading] = useState(false);

  // Total questions in current batch (comes from question payload)
  const total = q?.total ?? pendingNext?.total ?? 0;

  // ----- Theme (light/dark) -----
  const [mode, setMode] = useState<"light" | "dark">(
    (localStorage.getItem("mui-theme") as "light" | "dark") || "light"
  );
  const theme = useMemo(() => createTheme({
    palette: { mode },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: [
        "Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial",
        "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "sans-serif"
      ].join(","),
    }
  }), [mode]);

  const toggleTheme = () => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    localStorage.setItem("mui-theme", next);
  };

  // ----- Refs for focus management -----
  const answerRef = useRef<HTMLInputElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);

  // Focus answer field when a new question is shown (and feedback is cleared)
  useEffect(() => {
    if (q && !feedback) {
      const id = setTimeout(() => answerRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [q, feedback]);

  // ----- Handlers -----
  const onStart = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      setBatchSummary(null);
      setAnsweredCount(0);
      const res = await start(subject, level);
      setSession(res.session_id);
      setLevel(res.level);
      setQ(res.question);                 // show first question
      setPendingNext(null);
      setPendingBatchComplete(false);
    } catch (e: any) {
      console.error(e);
      alert(`Start failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async () => {
    if (!session || !q) return;
    if (feedback) return; // already submitted for this question
    try {
      setLoading(true);
      const res = await submitAnswer(session, q.q_id, answer.trim());
      // Show feedback, but DO NOT advance the question yet.
      setFeedback({
        score: res.score,
        reason: res.reason,
        explanation: res.explanation,
        correct: res.correct_answer,
      });
      setPendingNext(res.next_question);
      setPendingBatchComplete(res.batch_complete);
      // Progress bar advances only after submit:
      setAnsweredCount((c) => Math.min(total || c + 1, c + 1));
      setAnswer(""); // clear input after submit

      // move focus to the Next button after feedback is rendered
      setTimeout(() => nextRef.current?.focus(), 0);
    } catch (e: any) {
      console.error(e);
      alert(`Submit failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const onNext = () => {
    if (!feedback) return; // only proceed after feedback is shown
    // Clear feedback and move to the next view
    setFeedback(null);

    if (pendingBatchComplete) {
      // End of batch: show summary screen
      setQ(null);
      setPendingNext(null);
      setPendingBatchComplete(false);
    } else if (pendingNext) {
      // Move to next question
      setQ(pendingNext);
      setPendingNext(null);
      setPendingBatchComplete(false);
    }
  };

  const onContinue = async (cont: boolean) => {
    if (!session) return;
    try {
      setLoading(true);
      const res = await continueNext(session, cont);
      setLevel(res.level);
      setBatchSummary(res.batch_summary ?? null);
      // New batch → reset per-batch states
      setFeedback(null);
      setAnswer("");
      setQ(res.question);
      setPendingNext(null);
      setPendingBatchComplete(false);
      setAnsweredCount(0);
    } catch (e: any) {
      console.error(e);
      alert(`Continue failed: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (!feedback) onSubmit();
      else onNext();
    }
  };

  // Progress %: based on how many answers were submitted
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      {/* Sticky Header with progress & theme toggle */}
      <AppBar position="sticky" elevation={0} color="default" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Paper elevation={0} sx={{ p: 1, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText" }}>
            <Typography variant="subtitle2" fontWeight={700}>TA</Typography>
          </Paper>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Teaching Assistant
          </Typography>

          {session ? <Chip label={level} variant="outlined" /> : <Chip label="—" variant="outlined" />}
          <IconButton onClick={toggleTheme} aria-label="toggle theme" size="small">
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Toolbar>

        <Box sx={{ px: 2, pb: 1 }}>
          <LinearProgress variant="determinate" value={progressPct} />
          <Container maxWidth="md" sx={{ px: 0, py: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {q ? `Question ${q.index + 1} of ${q.total}` : "Ready"}
            </Typography>
          </Container>
        </Box>
      </AppBar>

      {/* Main content */}
      <Container maxWidth="md" sx={{ my: 4 }}>
        {!session ? (
          <Card sx={{ p: 2 }}>
            <CardContent>
              <Typography variant="h5" fontWeight={600}>Get started</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Choose a subject and level, then we’ll generate a tailored batch of questions.
              </Typography>

              <Stack spacing={2} sx={{ mt: 3 }}>
                <TextField
                  label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. atoms"
                />
                <FormControl fullWidth>
                  <InputLabel id="level-label">Level</InputLabel>
                  <Select
                    labelId="level-label"
                    label="Level"
                    value={level}
                    onChange={(e) => setLevel(e.target.value as Level)}
                  >
                    {LEVELS.map((l) => (
                      <MenuItem key={l} value={l}>{l}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Stack direction="row" spacing={1.5}>
                  <Button variant="contained" onClick={onStart} disabled={loading}>
                    {loading ? "Starting…" : "Start"}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <>
            {q ? (
              <Card sx={{ p: 2 }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                      Question {q.index + 1} / {q.total}
                    </Typography>
                    <Chip label={`Session ${session.slice(0, 8)}`} size="small" />
                  </Stack>

                  <Typography variant="h6" sx={{ mt: 1.5 }}>{q.question}</Typography>

                  <Stack spacing={1.5} sx={{ mt: 2 }}>
                    <TextField
                      fullWidth
                      placeholder="Type your answer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={!!feedback} // lock input after submit until Next
                      inputRef={answerRef}  // <-- focus target on new question
                    />
                    <Stack direction="row" spacing={1.5}>
                      <Button
                        variant="contained"
                        onClick={onSubmit}
                        disabled={!answer.trim() || loading || !!feedback}
                      >
                        {loading ? "Submitting…" : "Submit"}
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={onNext}
                        disabled={!feedback || loading}
                        ref={nextRef}       // <-- focus target after submit
                      >
                        Next
                      </Button>
                    </Stack>
                  </Stack>

                  <Collapse in={!!feedback} unmountOnExit>
                    <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: (t) => t.palette.action.hover }}>
                      {feedback && (
                        <>
                          <Typography variant="body2"><b>Score:</b> {feedback.score}/10</Typography>
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            <b>Reason:</b> {feedback.reason}
                          </Typography>
                          <Divider sx={{ my: 1 }} />
                          <details>
                            <summary style={{ cursor: "pointer" }}>Reveal explanation &amp; correct answer</summary>
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="body2"><b>Correct:</b> {feedback.correct}</Typography>
                              <Typography variant="body2"><b>Explanation:</b> {feedback.explanation}</Typography>
                            </Box>
                          </details>
                        </>
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            ) : (
              <Card sx={{ p: 2 }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={600}>Batch complete</Typography>

                  {batchSummary && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
                      <Box sx={{ flex: 1, p: 2, borderRadius: 2, border: 1, borderColor: "divider", textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">Questions</Typography>
                        <Typography variant="h6">{batchSummary.count}</Typography>
                      </Box>
                      <Box sx={{ flex: 1, p: 2, borderRadius: 2, border: 1, borderColor: "divider", textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">Total</Typography>
                        <Typography variant="h6">{batchSummary.total} / {batchSummary.count * 10}</Typography>
                      </Box>
                      <Box sx={{ flex: 1, p: 2, borderRadius: 2, border: 1, borderColor: "divider", textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">Average</Typography>
                        <Typography variant="h6">{batchSummary.avg}/10</Typography>
                      </Box>
                    </Stack>
                  )}

                  <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
                    <Button variant="contained" onClick={() => onContinue(true)} disabled={loading}>
                      Continue (next batch)
                    </Button>
                    <Button variant="outlined" onClick={() => onContinue(false)} disabled={loading}>
                      Finish
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </Container>
    </ThemeProvider>
  );
}
