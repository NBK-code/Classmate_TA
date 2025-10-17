import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";

type Props = {
  qid?: string;
  header?: ReactNode;
  children: ReactNode;
};

export default function QuestionCard({ qid, header, children }: Props) {
  return (
    <div className="card p-6">
      {header}
      <AnimatePresence mode="sync">
        <motion.div
          key={qid ?? "empty"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="mt-2"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
