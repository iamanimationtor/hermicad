import { PageLoading } from "@/components/PageLoading";

/** دروازهٔ کیفیت: کل مجموعهٔ آزمون‌ها روی درخواست اجرا می‌شود. */
export default function Loading() {
  return <PageLoading title="دروازهٔ کیفیت — اجرای آزمون‌ها" rows={2} />;
}
