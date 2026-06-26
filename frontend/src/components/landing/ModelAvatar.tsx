import { FaRobot } from "react-icons/fa";

type Props = {
  size?: number;
};

export default function ModelAvatar({ size = 34 }: Props) {
  return (
    <span className="model-avatar" style={{ width: size, height: size }} aria-hidden>
      <FaRobot />
    </span>
  );
}
